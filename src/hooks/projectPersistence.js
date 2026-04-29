export const LAST_SELECTED_PROJECT_KEY = 'lastSelectedProject';
export const LAST_SESSION_BY_PROJECT_KEY = 'lastSessionByProject';

/**
 * @param {string} key
 * @returns {string | null}
 */
export const readPersistedString = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * @param {string} key
 * @param {string | null | undefined} value
 */
export const writePersistedString = (key, value) => {
  try {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, value);
  } catch {
    // Silently ignore storage errors
  }
};

/**
 * @returns {Record<string, string>}
 */
export const readLastSessionByProject = () => {
  try {
    const raw = localStorage.getItem(LAST_SESSION_BY_PROJECT_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce((acc, [projectName, sessionId]) => {
      if (typeof projectName === 'string' && typeof sessionId === 'string' && sessionId) {
        acc[projectName] = sessionId;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

/**
 * @param {Record<string, string>} value
 */
export const writeLastSessionByProject = (value) => {
  try {
    if (Object.keys(value).length === 0) {
      localStorage.removeItem(LAST_SESSION_BY_PROJECT_KEY);
      return;
    }

    localStorage.setItem(LAST_SESSION_BY_PROJECT_KEY, JSON.stringify(value));
  } catch {
    // Silently ignore storage errors
  }
};

/**
 * @param {{ name: string }[]} projects
 */
export const prunePersistedProjectSelections = (projects) => {
  const validProjectNames = new Set(projects.map((project) => project.name));
  const currentProjectName = readPersistedString(LAST_SELECTED_PROJECT_KEY);

  if (currentProjectName && !validProjectNames.has(currentProjectName)) {
    writePersistedString(LAST_SELECTED_PROJECT_KEY, null);
  }

  const current = readLastSessionByProject();
  const nextEntries = Object.entries(current).filter(([projectName]) => validProjectNames.has(projectName));

  if (nextEntries.length !== Object.keys(current).length) {
    writeLastSessionByProject(Object.fromEntries(nextEntries));
  }
};

/**
 * @param {{ name: string }[]} projects
 * @param {{ name?: string | null } | null | undefined} selectedProject
 * @returns {boolean}
 */
export const isProjectSelectionStale = (projects, selectedProject) => {
  if (!selectedProject?.name) {
    return false;
  }

  return !projects.some((project) => project.name === selectedProject.name);
};
