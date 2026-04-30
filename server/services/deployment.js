import path from 'path';
import { promises as fs } from 'fs';
import { userDb } from '../database/db.js';
import { expandHomePath } from '../utils/workspace-paths.js';

export const DEPLOYABLE_ARTIFACT_TYPES = ['android', 'ios', 'mini-program', 'prototype', 'web'];
const ARTIFACT_SOURCE_PATH_ALLOWLIST = {
  prototype: new Set(['prototype']),
  web: new Set(['dist']),
};
const ARTIFACT_ENTRYPOINTS = {
  prototype: 'index.html',
};
const ARTIFACT_SOURCE_PATHS = {
  prototype: 'prototype',
};

const DEFAULT_DEPLOY_ROOT = '~/workspace/deploy';

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

function resolveDeployUserSegment(userId) {
  const normalizedUserId = normalizeIdentifier(userId, 'User ID');
  const publicId = userDb.getPublicId(normalizedUserId);
  if (!publicId) {
    throw new Error(`No public deploy identifier found for user ${normalizedUserId}`);
  }

  return normalizeIdentifier(publicId, 'User public ID');
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

async function clearDirectoryContents(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  await Promise.all(entries.map((entry) => (
    fs.rm(path.join(targetPath, entry.name), { recursive: true, force: true })
  )));
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(value = '') {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdownBody(markdown = '') {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listItems = [];
  let inCodeBlock = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  const flushCodeBlock = () => {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }
  flushParagraph();
  flushList();

  return html.join('\n');
}

function getMarkdownTitle(markdown, fallbackTitle) {
  const heading = String(markdown || '').split(/\r?\n/).find((line) => /^#\s+/.test(line.trim()));
  return heading ? heading.trim().replace(/^#\s+/, '') : fallbackTitle;
}

function renderMarkdownDocument(markdown, title) {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #111827; background: #f9fafb; }
    main { max-width: 880px; margin: 0 auto; padding: 40px 24px 64px; background: #fff; min-height: 100vh; box-sizing: border-box; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.55em; color: #0f172a; }
    h1 { margin-top: 0; padding-bottom: 0.35em; border-bottom: 1px solid #e5e7eb; }
    p, ul, pre { margin: 0 0 1em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; background: #f3f4f6; border-radius: 4px; padding: 0.12em 0.3em; }
    pre { overflow: auto; padding: 16px; border-radius: 8px; background: #111827; color: #f9fafb; }
    pre code { background: transparent; padding: 0; color: inherit; }
    @media (prefers-color-scheme: dark) {
      body { color: #e5e7eb; background: #030712; }
      main { background: #111827; }
      h1, h2, h3, h4, h5, h6 { color: #f9fafb; }
      h1 { border-bottom-color: #374151; }
      code { background: #1f2937; }
    }
  </style>
</head>
<body>
  <main>
${renderMarkdownBody(markdown)}
  </main>
</body>
</html>
`;
}

function isMarkdownPath(filePath) {
  return path.extname(filePath).toLowerCase() === '.md';
}

function isHtmlPath(filePath) {
  return ['.html', '.htm'].includes(path.extname(filePath).toLowerCase());
}

function getDeployRelativePathForSource(relativePath) {
  if (isMarkdownPath(relativePath)) {
    return relativePath.replace(/\.md$/i, '.html');
  }

  return relativePath;
}

function stripUrlDecorations(value) {
  const hashIndex = value.indexOf('#');
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
}

function getUrlDecoration(value) {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const indexes = [queryIndex, hashIndex].filter((index) => index !== -1);
  if (indexes.length === 0) {
    return '';
  }

  return value.slice(Math.min(...indexes));
}

function normalizeHtmlAssetReference(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return '';
  }

  if (/^(?:[a-z][a-z\d+.-]*:)/i.test(trimmed)) {
    return '';
  }

  const undecorated = stripUrlDecorations(trimmed).replace(/\\/g, '/');
  if (!undecorated) {
    return '';
  }

  try {
    return decodeURIComponent(undecorated);
  } catch {
    return undecorated;
  }
}

function getHtmlAssetReferences(html = '') {
  const references = new Set();
  const attributePattern = /\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    const reference = String(match[1] || match[2] || match[3] || '').trim();
    if (normalizeHtmlAssetReference(reference)) {
      references.add(reference);
    }
  }

  return Array.from(references);
}

function toHtmlRelativeUrl(fromRelativePath, toRelativePath) {
  const fromDir = path.posix.dirname(fromRelativePath.split(path.sep).join('/'));
  const targetPath = toRelativePath.split(path.sep).join('/');
  const relativeUrl = path.posix.relative(fromDir, targetPath);

  if (!relativeUrl || relativeUrl.startsWith('.') || relativeUrl.startsWith('/')) {
    return relativeUrl || './';
  }

  return `./${relativeUrl}`;
}

async function resolveHtmlAssetPath({
  reference,
  sourceDir,
  resolvedProjectPath,
}) {
  const normalizedReference = normalizeHtmlAssetReference(reference);
  if (!normalizedReference) {
    return null;
  }

  const referencePath = normalizedReference.replace(/^\/+/, '');
  const candidates = normalizedReference.startsWith('/')
    ? [
      path.resolve(sourceDir, referencePath),
      path.resolve(resolvedProjectPath, referencePath),
    ]
    : [path.resolve(sourceDir, normalizedReference)];

  for (const candidatePath of candidates) {
    let resolvedAssetPath;
    try {
      resolvedAssetPath = await fs.realpath(candidatePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    if (!isPathInside(resolvedProjectPath, resolvedAssetPath)) {
      continue;
    }

    const assetStats = await fs.stat(resolvedAssetPath);
    if (assetStats.isFile()) {
      return resolvedAssetPath;
    }
  }

  return null;
}

async function copyAndRewriteHtmlReferencedAssets({
  html,
  resolvedProjectPath,
  resolvedSourcePath,
  sourceRelativePath,
  deployRootPath,
}) {
  const sourceDir = path.dirname(resolvedSourcePath);
  const references = getHtmlAssetReferences(html);
  const rewrittenReferences = new Map();

  await Promise.all(references.map(async (reference) => {
    const resolvedAssetPath = await resolveHtmlAssetPath({
      reference,
      sourceDir,
      resolvedProjectPath,
    });

    if (!resolvedAssetPath) {
      return;
    }

    const assetRelativePath = path.relative(resolvedProjectPath, resolvedAssetPath);
    const targetAssetPath = path.join(deployRootPath, assetRelativePath);
    await fs.mkdir(path.dirname(targetAssetPath), { recursive: true });
    await fs.cp(resolvedAssetPath, targetAssetPath, { force: true, preserveTimestamps: true });

    if (!reference.startsWith('/')) {
      return;
    }

    rewrittenReferences.set(
      reference,
      `${toHtmlRelativeUrl(sourceRelativePath, assetRelativePath)}${getUrlDecoration(reference)}`,
    );
  }));

  if (rewrittenReferences.size === 0) {
    return html;
  }

  return html.replace(
    /(\b(?:href|src)\s*=\s*)("([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    (match, prefix, quotedValue, doubleQuotedValue, singleQuotedValue, unquotedValue) => {
      const value = doubleQuotedValue || singleQuotedValue || unquotedValue || '';
      const replacement = rewrittenReferences.get(value);
      if (!replacement) {
        return match;
      }

      if (doubleQuotedValue !== undefined) {
        return `${prefix}"${replacement}"`;
      }
      if (singleQuotedValue !== undefined) {
        return `${prefix}'${replacement}'`;
      }
      return `${prefix}${replacement}`;
    },
  );
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
  return path.resolve(expandHomePath(process.env.DEPLOY_ROOT || DEFAULT_DEPLOY_ROOT));
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

function validateArtifactSourcePath(artifactType, sourcePath) {
  const trimmedSourcePath = String(sourcePath ?? '').trim();
  if (!trimmedSourcePath) {
    throw new Error('Source path is required');
  }

  const allowedSourcePaths = ARTIFACT_SOURCE_PATH_ALLOWLIST[artifactType];
  if (allowedSourcePaths && !allowedSourcePaths.has(trimmedSourcePath)) {
    throw new Error(`Source path ${trimmedSourcePath} is not allowed for artifact type ${artifactType}`);
  }

  return trimmedSourcePath;
}

export function getProjectDeployRoot({ userId, projectId }) {
  return path.join(
    getDeployRoot(),
    resolveDeployUserSegment(userId),
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
    encodeUrlSegment(resolveDeployUserSegment(userId)),
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

export function buildProjectFilePublicUrl({
  userId,
  projectId,
  baseUrl = null,
  relativePath = '',
}) {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || getDeployBaseUrl());
  if (!resolvedBaseUrl) {
    return null;
  }

  const urlPathSegments = [
    encodeUrlSegment(resolveDeployUserSegment(userId)),
    encodeUrlSegment(projectId),
  ];

  const trimmedRelativePath = String(relativePath ?? '').trim().replace(/^[/\\]+/, '');
  if (trimmedRelativePath) {
    urlPathSegments.push(...trimmedRelativePath.split(/[\\/]+/).filter(Boolean).map(encodeUrlSegment));
  }

  return `${resolvedBaseUrl}/${urlPathSegments.join('/')}`;
}

async function getArtifactAvailability({ artifactType, targetPath, projectPath = null }) {
  const entrypoint = ARTIFACT_ENTRYPOINTS[artifactType] || null;
  if (!entrypoint) {
    return {
      available: false,
      deployedAvailable: false,
      sourceAvailable: false,
      entrypoint: null,
    };
  }

  const deployedAvailable = await pathExists(path.join(targetPath, entrypoint));
  const sourcePath = ARTIFACT_SOURCE_PATHS[artifactType] || null;
  const sourceAvailable = projectPath
    ? await pathExists(path.join(projectPath, sourcePath || artifactType, entrypoint))
    : false;

  return {
    available: deployedAvailable || sourceAvailable,
    deployedAvailable,
    sourceAvailable,
    entrypoint,
  };
}

export async function getProjectDeploymentInfo({ userId, projectId, baseUrl = null, projectPath = null }) {
  const rootPath = getProjectDeployRoot({ userId, projectId });
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || getDeployBaseUrl()) || null;
  const userPublicId = resolveDeployUserSegment(userId);
  const targets = await Promise.all(DEPLOYABLE_ARTIFACT_TYPES.map(async (type) => {
    const targetPath = path.join(rootPath, type);
    const availability = await getArtifactAvailability({
      artifactType: type,
      targetPath,
      projectPath,
    });

    return {
      type,
      path: targetPath,
      url: buildArtifactPublicUrl({
        userId,
        projectId,
        artifactType: type,
        baseUrl: resolvedBaseUrl,
        trailingSlash: true,
      }),
      ...availability,
    };
  }));

  return {
    userId,
    userPublicId,
    projectId,
    rootPath,
    baseUrl: resolvedBaseUrl,
    targets,
  };
}

export async function ensureProjectDeployDirectories({ userId, projectId, baseUrl = null, projectPath = null }) {
  const legacyProjectDeployRoot = path.join(
    getDeployRoot(),
    normalizeIdentifier(userId, 'User ID'),
    normalizeIdentifier(projectId, 'Project ID'),
  );
  const projectDeployRoot = getProjectDeployRoot({ userId, projectId });

  if (legacyProjectDeployRoot !== projectDeployRoot) {
    const [legacyExists, targetExists] = await Promise.all([
      fs.access(legacyProjectDeployRoot).then(() => true).catch(() => false),
      fs.access(projectDeployRoot).then(() => true).catch(() => false),
    ]);

    if (legacyExists && !targetExists) {
      await fs.mkdir(path.dirname(projectDeployRoot), { recursive: true });
      await fs.rename(legacyProjectDeployRoot, projectDeployRoot);
    }
  }

  await fs.mkdir(projectDeployRoot, { recursive: true });

  await Promise.all(
    DEPLOYABLE_ARTIFACT_TYPES.map((artifactType) => (
      fs.mkdir(path.join(projectDeployRoot, artifactType), { recursive: true })
    )),
  );

  return getProjectDeploymentInfo({ userId, projectId, baseUrl, projectPath });
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
  const normalizedSourcePath = validateArtifactSourcePath(normalizedArtifactType, sourcePath);
  const deploymentInfo = await ensureProjectDeployDirectories({ userId, projectId, baseUrl, projectPath });
  const targetPath = getArtifactDeployPath({ userId, projectId, artifactType: normalizedArtifactType });
  const resolvedSourcePath = await resolveProjectScopedSourcePath(projectPath, normalizedSourcePath);
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

export async function publishProjectFileToDeployment({
  userId,
  projectId,
  projectPath,
  sourcePath,
  baseUrl = null,
}) {
  const deploymentInfo = await ensureProjectDeployDirectories({ userId, projectId, baseUrl, projectPath });
  const resolvedProjectPath = await fs.realpath(projectPath);
  const resolvedSourcePath = await resolveProjectScopedSourcePath(projectPath, sourcePath);
  const sourceStats = await fs.stat(resolvedSourcePath);

  if (!sourceStats.isFile()) {
    throw new Error('Source path must be a file');
  }

  const sourceRelativePath = path.relative(resolvedProjectPath, resolvedSourcePath).split(path.sep).join('/');
  const relativePath = getDeployRelativePathForSource(sourceRelativePath);
  const targetPath = path.join(getProjectDeployRoot({ userId, projectId }), relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (isMarkdownPath(resolvedSourcePath)) {
    const markdown = await fs.readFile(resolvedSourcePath, 'utf8');
    const title = getMarkdownTitle(markdown, path.basename(relativePath, '.html'));
    await fs.writeFile(targetPath, renderMarkdownDocument(markdown, title), 'utf8');
  } else {
    if (isHtmlPath(resolvedSourcePath)) {
      const html = await fs.readFile(resolvedSourcePath, 'utf8');
      const rewrittenHtml = await copyAndRewriteHtmlReferencedAssets({
        html,
        resolvedProjectPath,
        resolvedSourcePath,
        sourceRelativePath,
        deployRootPath: getProjectDeployRoot({ userId, projectId }),
      });
      await fs.writeFile(targetPath, rewrittenHtml, 'utf8');
    } else {
      await fs.cp(resolvedSourcePath, targetPath, { force: true, preserveTimestamps: true });
    }
  }

  return {
    ...deploymentInfo,
    sourcePath: resolvedSourcePath,
    targetPath,
    sourceRelativePath,
    relativePath,
    publicUrl: buildProjectFilePublicUrl({
      userId,
      projectId,
      baseUrl: deploymentInfo.baseUrl,
      relativePath,
    }),
  };
}
