import path from 'path';
import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import { userProjectsDb } from '../database/db.js';
import {
  getArtifactDeployPath,
  ensureProjectDeployDirectories,
  buildArtifactPublicUrl,
} from './deployment.js';

const WATCH_DEBOUNCE_MS = 1500;
const WATCHED_DEPLOYMENT_RULES = [
  { artifactType: 'prototype', sourcePath: 'docs' },
  { artifactType: 'prototype', sourcePath: 'prototype' },
  { artifactType: 'web', sourcePath: 'dist' },
];
const WATCHER_IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'build',
]);

const deploymentWatchers = new Map();

function getProjectWatcherKey(userId, projectId) {
  return `${String(userId)}:${String(projectId)}`;
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isPathInside(parentPath, childPath) {
  const normalizedParent = path.resolve(parentPath);
  const normalizedChild = path.resolve(childPath);

  if (normalizedChild === normalizedParent) {
    return true;
  }

  return normalizedChild.startsWith(`${normalizedParent}${path.sep}`);
}

function getDefaultDeploymentBaseUrl() {
  return normalizeBaseUrl(process.env.DEPLOY_BASE_URL || process.env.DEPLOY_BASE_PATH || '');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function getWatchRuleForPath(projectPath, changedPath) {
  const relativePath = path.relative(projectPath, changedPath);
  if (!relativePath || relativePath.startsWith('..')) {
    return null;
  }

  const normalizedRelativePath = relativePath.split(path.sep).join('/');

  return WATCHED_DEPLOYMENT_RULES.find((rule) => (
    normalizedRelativePath === rule.sourcePath
    || normalizedRelativePath.startsWith(`${rule.sourcePath}/`)
  )) || null;
}

async function syncDirectoryIncremental(sourceDir, targetDir) {
  const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true });
  const targetEntries = await fs.readdir(targetDir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });

  const sourceByName = new Map(sourceEntries.map((entry) => [entry.name, entry]));
  const targetByName = new Map(targetEntries.map((entry) => [entry.name, entry]));
  let copiedFiles = 0;
  let removedEntries = 0;

  for (const [name, sourceEntry] of sourceByName.entries()) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    const existingTargetEntry = targetByName.get(name) || null;

    if (sourceEntry.isDirectory()) {
      if (existingTargetEntry && !existingTargetEntry.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      }
      await fs.mkdir(targetPath, { recursive: true });
      const nestedResult = await syncDirectoryIncremental(sourcePath, targetPath);
      copiedFiles += nestedResult.copiedFiles;
      removedEntries += nestedResult.removedEntries;
      continue;
    }

    if (!sourceEntry.isFile()) {
      continue;
    }

    const sourceStat = await fs.stat(sourcePath);
    const targetStat = await fs.stat(targetPath).catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });

    const needsCopy = !targetStat
      || !targetStat.isFile()
      || sourceStat.size !== targetStat.size
      || sourceStat.mtimeMs > targetStat.mtimeMs + 1;

    if (needsCopy) {
      if (targetStat && !targetStat.isFile()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      }
      await fs.cp(sourcePath, targetPath, { force: true, preserveTimestamps: true });
      copiedFiles += 1;
    }
  }

  for (const [name] of targetByName.entries()) {
    if (sourceByName.has(name)) {
      continue;
    }

    await fs.rm(path.join(targetDir, name), { recursive: true, force: true });
    removedEntries += 1;
  }

  return { copiedFiles, removedEntries };
}

async function syncRuleForProject(projectRecord, rule) {
  const sourceDir = path.join(projectRecord.project_path, rule.sourcePath);
  if (!await pathExists(sourceDir)) {
    return null;
  }

  const sourceStat = await fs.stat(sourceDir);
  if (!sourceStat.isDirectory()) {
    return null;
  }

  await ensureProjectDeployDirectories({
    userId: projectRecord.user_id,
    projectId: projectRecord.id,
  });

  const targetDir = getArtifactDeployPath({
    userId: projectRecord.user_id,
    projectId: projectRecord.id,
    artifactType: rule.artifactType,
  });

  const result = await syncDirectoryIncremental(sourceDir, targetDir);
  const publicUrl = buildArtifactPublicUrl({
    userId: projectRecord.user_id,
    projectId: projectRecord.id,
    artifactType: rule.artifactType,
    baseUrl: getDefaultDeploymentBaseUrl() || null,
    trailingSlash: true,
  });

  return {
    ...result,
    sourceDir,
    targetDir,
    publicUrl,
  };
}

async function registerProjectDeploymentWatcher(projectRecord) {
  if (!projectRecord?.id || !projectRecord?.user_id || !projectRecord?.project_path) {
    return null;
  }

  const watcherKey = getProjectWatcherKey(projectRecord.user_id, projectRecord.id);
  await unregisterProjectDeploymentWatcher(projectRecord.user_id, projectRecord.id);

  const projectPath = path.resolve(projectRecord.project_path);
  if (!await pathExists(projectPath)) {
    return null;
  }

  const pendingRules = new Map();
  const state = {
    projectRecord: {
      ...projectRecord,
      project_path: projectPath,
    },
    watcher: null,
    timers: new Map(),
  };

  const scheduleRuleSync = (rule) => {
    const timerKey = `${rule.artifactType}:${rule.sourcePath}`;
    const existingTimer = state.timers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const nextTimer = setTimeout(async () => {
      state.timers.delete(timerKey);
      if (pendingRules.has(timerKey)) {
        return;
      }

      pendingRules.set(timerKey, rule);
      try {
        const syncResult = await syncRuleForProject(state.projectRecord, rule);
        if (syncResult && (syncResult.copiedFiles > 0 || syncResult.removedEntries > 0)) {
          console.log(
            `[DEPLOY_SYNC] user=${state.projectRecord.user_id} project=${state.projectRecord.id} `
            + `artifact=${rule.artifactType} source=${rule.sourcePath} copied=${syncResult.copiedFiles} `
            + `removed=${syncResult.removedEntries} target=${syncResult.targetDir}`
            + (syncResult.publicUrl ? ` url=${syncResult.publicUrl}` : ''),
          );
        }
      } catch (error) {
        console.error(
          `[DEPLOY_SYNC_ERROR] user=${state.projectRecord.user_id} project=${state.projectRecord.id} `
          + `artifact=${rule.artifactType} source=${rule.sourcePath}:`,
          error,
        );
      } finally {
        pendingRules.delete(timerKey);
      }
    }, WATCH_DEBOUNCE_MS);

    state.timers.set(timerKey, nextTimer);
  };

  const watcher = chokidar.watch(projectPath, {
    ignored: (watchedPath) => {
      const relativePath = path.relative(projectPath, watchedPath);
      if (!relativePath || relativePath.startsWith('..')) {
        return false;
      }

      const segments = relativePath.split(path.sep).filter(Boolean);
      if (segments.some((segment) => WATCHER_IGNORED_SEGMENTS.has(segment))) {
        return true;
      }

      return !WATCHED_DEPLOYMENT_RULES.some((rule) => (
        segments[0] === rule.sourcePath
      ));
    },
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
    depth: 8,
  });

  const handlePathChange = (changedPath) => {
    if (!isPathInside(projectPath, changedPath)) {
      return;
    }

    const rule = getWatchRuleForPath(projectPath, changedPath);
    if (!rule) {
      return;
    }

    scheduleRuleSync(rule);
  };

  watcher
    .on('add', handlePathChange)
    .on('change', handlePathChange)
    .on('unlink', handlePathChange)
    .on('addDir', handlePathChange)
    .on('unlinkDir', handlePathChange)
    .on('error', (error) => {
      console.error(
        `[DEPLOY_WATCHER_ERROR] user=${state.projectRecord.user_id} project=${state.projectRecord.id}:`,
        error,
      );
    });

  state.watcher = watcher;
  deploymentWatchers.set(watcherKey, state);
  return state;
}

async function unregisterProjectDeploymentWatcher(userId, projectId) {
  const watcherKey = getProjectWatcherKey(userId, projectId);
  const state = deploymentWatchers.get(watcherKey);
  if (!state) {
    return false;
  }

  for (const timer of state.timers.values()) {
    clearTimeout(timer);
  }

  state.timers.clear();
  await state.watcher?.close().catch((error) => {
    console.error(`[DEPLOY_WATCHER_CLOSE_ERROR] user=${userId} project=${projectId}:`, error);
  });
  deploymentWatchers.delete(watcherKey);
  return true;
}

async function initializeDeploymentWatchers() {
  const allProjects = userProjectsDb.getAllProjects();
  await Promise.all(allProjects.map((projectRecord) => registerProjectDeploymentWatcher(projectRecord)));
}

async function closeDeploymentWatchers() {
  await Promise.all(
    Array.from(deploymentWatchers.values()).map(async (state) => {
      for (const timer of state.timers.values()) {
        clearTimeout(timer);
      }
      state.timers.clear();
      await state.watcher?.close();
    }),
  );
  deploymentWatchers.clear();
}

export {
  initializeDeploymentWatchers,
  registerProjectDeploymentWatcher,
  unregisterProjectDeploymentWatcher,
  closeDeploymentWatchers,
};
