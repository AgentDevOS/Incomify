const DEFAULT_PUBLIC_DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizePath(value = '') {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getHrefPath(href) {
  const trimmedHref = String(href || '').trim();
  if (!trimmedHref) {
    return '';
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedHref) && !trimmedHref.startsWith('/')) {
    return normalizePath(trimmedHref);
  }

  try {
    const parsedUrl = new URL(trimmedHref, 'https://incomify.local');
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'file:') {
      return normalizePath(parsedUrl.pathname);
    }
  } catch {
    // Fall back to plain path handling below.
  }

  return normalizePath(trimmedHref);
}

function extractPublicIdFromPath(value) {
  const normalized = normalizePath(value);
  const match = normalized.match(/(?:^|\/)workspace\/(?:users|deploy)\/(usr_[^/]+)/);
  return match?.[1] || '';
}

function getProjectPublicId(project, hrefPath) {
  if (!project) {
    return '';
  }

  const directPublicId = project.publicId || project.userPublicId;
  if (typeof directPublicId === 'string' && directPublicId.trim()) {
    return directPublicId.trim();
  }

  return extractPublicIdFromPath(project.fullPath)
    || extractPublicIdFromPath(project.path)
    || extractPublicIdFromPath(hrefPath);
}

function getPreferredDeployBaseUrl(location, env = {}) {
  const configuredBaseUrl = normalizeBaseUrl(
    env.VITE_PUBLIC_DEPLOY_BASE_URL || env.VITE_DEPLOY_BASE_URL || '',
  );
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const resolvedLocation = location || globalThis.window?.location;
  const hostname = resolvedLocation?.hostname || '';
  const origin = normalizeBaseUrl(resolvedLocation?.origin || '');
  const isLocalhost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0';

  if (isLocalhost || !origin) {
    return DEFAULT_PUBLIC_DEPLOY_BASE_URL;
  }

  return `${origin}/aisoft/deploy`;
}

function isPrototypeEntrypointPath(hrefPath) {
  const normalized = normalizePath(hrefPath).replace(/^\.\//, '');
  return normalized === 'prototype/index.html'
    || normalized === 'prototype'
    || normalized.endsWith('/prototype/index.html')
    || normalized.endsWith('/prototype');
}

function isCurrentProjectPrototypeLink(hrefPath, project) {
  if (!isPrototypeEntrypointPath(hrefPath)) {
    return false;
  }

  const normalizedHrefPath = normalizePath(hrefPath).replace(/^\.\//, '');
  if (normalizedHrefPath === 'prototype/index.html' || normalizedHrefPath === 'prototype') {
    return true;
  }

  const projectRoots = [project?.fullPath, project?.path]
    .filter((value) => typeof value === 'string' && value.trim())
    .map(normalizePath);

  return projectRoots.some((projectRoot) => (
    normalizedHrefPath === `${projectRoot}/prototype/index.html`
      || normalizedHrefPath === `${projectRoot}/prototype`
  ));
}

function getProjectRoots(project) {
  return [project?.fullPath, project?.path]
    .filter((value) => typeof value === 'string' && value.trim())
    .map(normalizePath);
}

function getProjectRelativePath(hrefPath, project) {
  const normalizedHrefPath = normalizePath(hrefPath).replace(/^\.\//, '');
  const projectRoots = getProjectRoots(project);

  for (const projectRoot of projectRoots) {
    if (normalizedHrefPath === projectRoot) {
      return '';
    }

    if (normalizedHrefPath.startsWith(`${projectRoot}/`)) {
      return normalizedHrefPath.slice(projectRoot.length + 1);
    }
  }

  if (
    normalizedHrefPath
    && !normalizedHrefPath.startsWith('/')
    && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalizedHrefPath)
  ) {
    return normalizedHrefPath;
  }

  return '';
}

function isUnsafeRelativePath(relativePath) {
  return relativePath
    .split('/')
    .some((segment) => segment === '..' || segment === '');
}

function buildProjectDeployHref({ publicId, projectId, relativePath, location, env }) {
  const baseUrl = getPreferredDeployBaseUrl(location, env);
  const pathSegments = [
    encodeURIComponent(publicId),
    encodeURIComponent(String(projectId)),
    ...relativePath.split('/').filter(Boolean).map(encodeURIComponent),
  ];
  return `${baseUrl}/${pathSegments.join('/')}`;
}

function getDeployRelativePath(relativePath) {
  if (/\.md$/i.test(relativePath)) {
    return relativePath.replace(/\.md$/i, '.html');
  }

  return relativePath;
}

export function resolveProjectLink(href, options = {}) {
  const rawHref = String(href || '').trim();
  if (!rawHref) {
    return { href: '', shouldPublish: false, sourcePath: '' };
  }

  if (rawHref.includes('/aisoft/deploy/')) {
    return { href: rawHref, shouldPublish: false, sourcePath: '' };
  }

  const { project = null, location = null, env = import.meta.env || {} } = options;
  const hrefPath = getHrefPath(rawHref);
  const projectId = project?.id;

  if (projectId == null) {
    return { href: rawHref, shouldPublish: false, sourcePath: '' };
  }

  const publicId = getProjectPublicId(project, hrefPath);
  if (!publicId) {
    return { href: rawHref, shouldPublish: false, sourcePath: '' };
  }

  if (isCurrentProjectPrototypeLink(hrefPath, project)) {
    return {
      href: buildProjectDeployHref({
        publicId,
        projectId,
        relativePath: 'prototype/index.html',
        location,
        env,
      }),
      shouldPublish: false,
      sourcePath: '',
    };
  }

  const relativePath = getProjectRelativePath(hrefPath, project);
  if (!relativePath || isUnsafeRelativePath(relativePath)) {
    return { href: rawHref, shouldPublish: false, sourcePath: '' };
  }

  const projectRoot = getProjectRoots(project)[0] || '';
  const sourcePath = hrefPath.startsWith(projectRoot)
    ? hrefPath
    : `${projectRoot}/${relativePath}`;

  return {
    href: buildProjectDeployHref({
      publicId,
      projectId,
      relativePath: getDeployRelativePath(relativePath),
      location,
      env,
    }),
    shouldPublish: true,
    sourcePath,
  };
}

export function resolvePrototypeLinkHref(href, options = {}) {
  return resolveProjectLink(href, options).href;
}
