import path from 'path';
import { promises as fs } from 'fs';

export const DEPLOYABLE_ARTIFACT_TYPES = ['android', 'ios', 'mini-program', 'prototype', 'web'];

const DEFAULT_DEPLOY_ROOT = '/Users/steven/workspace/deploy';

function normalizeIdentifier(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return normalized;
}

function encodeUrlSegment(value) {
  return encodeURIComponent(String(value ?? '').trim());
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

async function clearDirectoryContents(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  await Promise.all(entries.map((entry) => (
    fs.rm(path.join(targetPath, entry.name), { recursive: true, force: true })
  )));
}

async function resolveProjectScopedSourcePath(projectPath, sourcePath) {
  const trimmedSourcePath = String(sourcePath ?? '').trim();
  if (!trimmedSourcePath) {
    throw new Error('Source path is required');
  }

  const resolvedProjectPath = await fs.realpath(projectPath);
  const candidateSourcePath = path.resolve(resolvedProjectPath, trimmedSourcePath);
  const resolvedSourcePath = await fs.realpath(candidateSourcePath);

  if (!isPathInside(resolvedProjectPath, resolvedSourcePath)) {
    throw new Error('Source path must stay within the project directory');
  }

  return resolvedSourcePath;
}

export function getDeployRoot() {
  return path.resolve(process.env.DEPLOY_ROOT || DEFAULT_DEPLOY_ROOT);
}

export function getDeployBaseUrl() {
  return normalizeBaseUrl(process.env.DEPLOY_BASE_URL || process.env.DEPLOY_BASE_PATH || '');
}

export function validateArtifactType(artifactType) {
  const normalizedArtifactType = String(artifactType ?? '').trim();
  if (!DEPLOYABLE_ARTIFACT_TYPES.includes(normalizedArtifactType)) {
    throw new Error(`Unsupported artifact type: ${normalizedArtifactType || '(empty)'}`);
  }

  return normalizedArtifactType;
}

export function getProjectDeployRoot({ userId, projectId }) {
  return path.join(
    getDeployRoot(),
    normalizeIdentifier(userId, 'User ID'),
    normalizeIdentifier(projectId, 'Project ID'),
  );
}

export function getArtifactDeployPath({ userId, projectId, artifactType }) {
  return path.join(
    getProjectDeployRoot({ userId, projectId }),
    validateArtifactType(artifactType),
  );
}

export function buildArtifactPublicUrl({
  userId,
  projectId,
  artifactType,
  baseUrl = null,
  relativePath = '',
  trailingSlash = false,
}) {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || getDeployBaseUrl());
  if (!resolvedBaseUrl) {
    return null;
  }

  const urlPathSegments = [
    encodeUrlSegment(userId),
    encodeUrlSegment(projectId),
    encodeUrlSegment(validateArtifactType(artifactType)),
  ];

  const trimmedRelativePath = String(relativePath ?? '').trim().replace(/^[/\\]+/, '');
  if (trimmedRelativePath) {
    urlPathSegments.push(...trimmedRelativePath.split(/[\\/]+/).filter(Boolean).map(encodeUrlSegment));
  }

  const url = `${resolvedBaseUrl}/${urlPathSegments.join('/')}`;
  return trailingSlash ? `${url}/` : url;
}

export function getProjectDeploymentInfo({ userId, projectId, baseUrl = null }) {
  const rootPath = getProjectDeployRoot({ userId, projectId });
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || getDeployBaseUrl()) || null;

  return {
    userId,
    projectId,
    rootPath,
    baseUrl: resolvedBaseUrl,
    targets: DEPLOYABLE_ARTIFACT_TYPES.map((type) => ({
      type,
      path: path.join(rootPath, type),
      url: buildArtifactPublicUrl({
        userId,
        projectId,
        artifactType: type,
        baseUrl: resolvedBaseUrl,
        trailingSlash: true,
      }),
    })),
  };
}

export async function ensureProjectDeployDirectories({ userId, projectId, baseUrl = null }) {
  const projectDeployRoot = getProjectDeployRoot({ userId, projectId });
  await fs.mkdir(projectDeployRoot, { recursive: true });

  await Promise.all(
    DEPLOYABLE_ARTIFACT_TYPES.map((artifactType) => (
      fs.mkdir(path.join(projectDeployRoot, artifactType), { recursive: true })
    )),
  );

  return getProjectDeploymentInfo({ userId, projectId, baseUrl });
}

export async function deployProjectArtifact({
  userId,
  projectId,
  projectPath,
  artifactType,
  baseUrl = null,
  sourcePath,
  clearTarget = true,
}) {
  const normalizedArtifactType = validateArtifactType(artifactType);
  const deploymentInfo = await ensureProjectDeployDirectories({ userId, projectId, baseUrl });
  const targetPath = getArtifactDeployPath({ userId, projectId, artifactType: normalizedArtifactType });
  const resolvedSourcePath = await resolveProjectScopedSourcePath(projectPath, sourcePath);
  const sourceStats = await fs.stat(resolvedSourcePath);

  if (clearTarget) {
    await clearDirectoryContents(targetPath);
  }

  let copiedEntries = [];

  if (sourceStats.isDirectory()) {
    const sourceEntries = await fs.readdir(resolvedSourcePath, { withFileTypes: true });
    copiedEntries = sourceEntries.map((entry) => entry.name);

    await Promise.all(sourceEntries.map((entry) => (
      fs.cp(
        path.join(resolvedSourcePath, entry.name),
        path.join(targetPath, entry.name),
        { recursive: true, force: true },
      )
    )));
  } else {
    const fileName = path.basename(resolvedSourcePath);
    copiedEntries = [fileName];
    await fs.cp(resolvedSourcePath, path.join(targetPath, fileName), { force: true });
  }

  return {
    ...deploymentInfo,
    artifactType: normalizedArtifactType,
    sourcePath: resolvedSourcePath,
    targetPath,
    copiedEntries,
    clearTarget,
    publicUrl: sourceStats.isDirectory()
      ? buildArtifactPublicUrl({
        userId,
        projectId,
        artifactType: normalizedArtifactType,
        baseUrl: deploymentInfo.baseUrl,
        trailingSlash: true,
      })
      : buildArtifactPublicUrl({
        userId,
        projectId,
        artifactType: normalizedArtifactType,
        baseUrl: deploymentInfo.baseUrl,
        relativePath: copiedEntries[0] || '',
      }),
  };
}
