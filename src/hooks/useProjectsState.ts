import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { api } from '../utils/api';
import type {
  AppSocketMessage,
  AppTab,
  LoadingProgress,
  Project,
  ProjectSession,
  ProjectsUpdatedMessage,
} from '../types/app';

type UseProjectsStateArgs = {
  sessionId?: string;
  navigate: NavigateFunction;
  latestMessage: AppSocketMessage | null;
  isMobile: boolean;
  activeSessions: Set<string>;
};

type FetchProjectsOptions = {
  showLoadingState?: boolean;
};

const LAST_SELECTED_PROJECT_KEY = 'lastSelectedProject';
const LAST_SESSION_BY_PROJECT_KEY = 'lastSessionByProject';

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const readPersistedString = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writePersistedString = (key: string, value: string | null) => {
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

const readLastSessionByProject = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(LAST_SESSION_BY_PROJECT_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [projectName, sessionId]) => {
      if (typeof projectName === 'string' && typeof sessionId === 'string' && sessionId) {
        acc[projectName] = sessionId;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const writeLastSessionByProject = (value: Record<string, string>) => {
  try {
    localStorage.setItem(LAST_SESSION_BY_PROJECT_KEY, JSON.stringify(value));
  } catch {
    // Silently ignore storage errors
  }
};

const projectsHaveChanges = (
  prevProjects: Project[],
  nextProjects: Project[],
  includeExternalSessions: boolean,
): boolean => {
  if (prevProjects.length !== nextProjects.length) {
    return true;
  }

  return nextProjects.some((nextProject, index) => {
    const prevProject = prevProjects[index];
    if (!prevProject) {
      return true;
    }

    const baseChanged =
      nextProject.name !== prevProject.name ||
      nextProject.displayName !== prevProject.displayName ||
      nextProject.fullPath !== prevProject.fullPath ||
      serialize(nextProject.sessionMeta) !== serialize(prevProject.sessionMeta) ||
      serialize(nextProject.sessions) !== serialize(prevProject.sessions) ||
      serialize(nextProject.taskmaster) !== serialize(prevProject.taskmaster);

    if (baseChanged) {
      return true;
    }

    if (!includeExternalSessions) {
      return false;
    }

    return (
      serialize(nextProject.cursorSessions) !== serialize(prevProject.cursorSessions) ||
      serialize(nextProject.codexSessions) !== serialize(prevProject.codexSessions) ||
      serialize(nextProject.geminiSessions) !== serialize(prevProject.geminiSessions)
    );
  });
};

const getProjectSessions = (project: Project): ProjectSession[] => {
  return [
    ...(project.sessions ?? []),
    ...(project.codexSessions ?? []),
    ...(project.cursorSessions ?? []),
    ...(project.geminiSessions ?? []),
  ];
};

const getProjectSessionsWithProviders = (project: Project): ProjectSession[] => {
  const withProjectName = (session: ProjectSession, provider: ProjectSession['__provider']) => ({
    ...session,
    __provider: provider,
    __projectName: session.__projectName || project.name,
  });

  return [
    ...(project.sessions ?? []).map((session) => withProjectName(session, 'claude')),
    ...(project.codexSessions ?? []).map((session) => withProjectName(session, 'codex')),
    ...(project.cursorSessions ?? []).map((session) => withProjectName(session, 'cursor')),
    ...(project.geminiSessions ?? []).map((session) => withProjectName(session, 'gemini')),
  ];
};

const getSessionActivityTime = (session: ProjectSession): number => {
  const candidates = [
    session.updated_at,
    session.lastActivity,
    session.createdAt,
    session.created_at,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string' || !value) {
      continue;
    }

    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
};

const findProjectSessionById = (project: Project, targetSessionId: string): ProjectSession | null => {
  return getProjectSessionsWithProviders(project).find((session) => session.id === targetSessionId) ?? null;
};

const getPreferredProjectSession = (
  project: Project,
  lastSessionByProject: Record<string, string>,
): ProjectSession | null => {
  const sessions = getProjectSessionsWithProviders(project);
  if (sessions.length === 0) {
    return null;
  }

  const lastSessionId = lastSessionByProject[project.name];
  if (lastSessionId) {
    const persisted = sessions.find((session) => session.id === lastSessionId);
    if (persisted) {
      return persisted;
    }
  }

  return sessions.reduce<ProjectSession | null>((latest, session) => {
    if (!latest) {
      return session;
    }

    return getSessionActivityTime(session) > getSessionActivityTime(latest) ? session : latest;
  }, null);
};

const isUpdateAdditive = (
  currentProjects: Project[],
  updatedProjects: Project[],
  selectedProject: Project | null,
  selectedSession: ProjectSession | null,
): boolean => {
  if (!selectedProject || !selectedSession) {
    return true;
  }

  const currentSelectedProject = currentProjects.find((project) => project.name === selectedProject.name);
  const updatedSelectedProject = updatedProjects.find((project) => project.name === selectedProject.name);

  if (!currentSelectedProject || !updatedSelectedProject) {
    return false;
  }

  const currentSelectedSession = getProjectSessions(currentSelectedProject).find(
    (session) => session.id === selectedSession.id,
  );
  const updatedSelectedSession = getProjectSessions(updatedSelectedProject).find(
    (session) => session.id === selectedSession.id,
  );

  if (!currentSelectedSession || !updatedSelectedSession) {
    return false;
  }

  return (
    currentSelectedSession.id === updatedSelectedSession.id &&
    currentSelectedSession.title === updatedSelectedSession.title &&
    currentSelectedSession.created_at === updatedSelectedSession.created_at &&
    currentSelectedSession.updated_at === updatedSelectedSession.updated_at
  );
};

const VALID_TABS: Set<string> = new Set(['chat', 'files', 'shell', 'git', 'tasks', 'preview']);

const isValidTab = (tab: string): tab is AppTab => {
  return VALID_TABS.has(tab) || tab.startsWith('plugin:');
};

const readPersistedTab = (): AppTab => {
  try {
    const stored = localStorage.getItem('activeTab');
    if (stored && isValidTab(stored)) {
      return stored as AppTab;
    }
  } catch {
    // localStorage unavailable
  }
  return 'chat';
};

export function useProjectsState({
  sessionId,
  navigate,
  latestMessage,
  isMobile,
  activeSessions,
}: UseProjectsStateArgs) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<ProjectSession | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(readPersistedTab);

  useEffect(() => {
    try {
      localStorage.setItem('activeTab', activeTab);
    } catch {
      // Silently ignore storage errors
    }
  }, [activeTab]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('agents');
  const [externalMessageUpdate, setExternalMessageUpdate] = useState(0);

  const loadingProgressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRootRef = useRef(false);
  const skipNextRootSessionRestoreRef = useRef(false);
  const projectsMutationVersionRef = useRef(0);
  const projectsFetchRequestSeqRef = useRef(0);

  const persistProjectSelection = useCallback((projectName: string | null | undefined) => {
    writePersistedString(LAST_SELECTED_PROJECT_KEY, projectName ?? null);
  }, []);

  const persistSessionSelection = useCallback((projectName: string | null | undefined, nextSessionId: string | null | undefined) => {
    if (!projectName) {
      return;
    }

    const current = readLastSessionByProject();
    if (!nextSessionId) {
      if (!(projectName in current)) {
        return;
      }

      const next = { ...current };
      delete next[projectName];
      writeLastSessionByProject(next);
      return;
    }

    if (current[projectName] === nextSessionId) {
      return;
    }

    writeLastSessionByProject({
      ...current,
      [projectName]: nextSessionId,
    });
  }, []);

  const clearPersistedSessionSelection = useCallback((sessionIdToDelete: string) => {
    const current = readLastSessionByProject();
    const nextEntries = Object.entries(current).filter(([, persistedSessionId]) => persistedSessionId !== sessionIdToDelete);
    if (nextEntries.length === Object.keys(current).length) {
      return;
    }
    writeLastSessionByProject(Object.fromEntries(nextEntries));
  }, []);

  const clearPersistedProjectSelection = useCallback((projectName: string) => {
    const currentProjectName = readPersistedString(LAST_SELECTED_PROJECT_KEY);
    if (currentProjectName === projectName) {
      writePersistedString(LAST_SELECTED_PROJECT_KEY, null);
    }

    const current = readLastSessionByProject();
    if (!(projectName in current)) {
      return;
    }

    const next = { ...current };
    delete next[projectName];
    writeLastSessionByProject(next);
  }, []);

  const fetchProjects = useCallback(async ({ showLoadingState = true }: FetchProjectsOptions = {}) => {
    const requestSeq = ++projectsFetchRequestSeqRef.current;
    const mutationVersionAtStart = projectsMutationVersionRef.current;

    try {
      if (showLoadingState) {
        setIsLoadingProjects(true);
      }
      const response = await api.projects();
      const projectData = (await response.json()) as Project[];

      if (
        requestSeq !== projectsFetchRequestSeqRef.current ||
        mutationVersionAtStart !== projectsMutationVersionRef.current
      ) {
        return;
      }

      console.log('[SessionDebug][Projects] fetched projects', projectData.map((project) => ({
        name: project.name,
        sessions: project.sessions?.map((session) => session.id) ?? [],
        cursorSessions: project.cursorSessions?.map((session) => session.id) ?? [],
        codexSessions: project.codexSessions?.map((session) => session.id) ?? [],
        geminiSessions: project.geminiSessions?.map((session) => session.id) ?? [],
      })));

      setProjects((prevProjects) => {
        if (prevProjects.length === 0) {
          return projectData;
        }

        return projectsHaveChanges(prevProjects, projectData, true)
          ? projectData
          : prevProjects;
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      if (showLoadingState) {
        setIsLoadingProjects(false);
      }
    }
  }, []);

  const refreshProjectsSilently = useCallback(async () => {
    // Keep chat view stable while still syncing sidebar/session metadata in background.
    await fetchProjects({ showLoadingState: false });
  }, [fetchProjects]);

  const openSettings = useCallback((tab = 'tools') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (sessionId) {
      hasRestoredRootRef.current = false;
      skipNextRootSessionRestoreRef.current = false;
      return;
    }

    if (isLoadingProjects || projects.length === 0 || hasRestoredRootRef.current || selectedSession) {
      return;
    }

    if (skipNextRootSessionRestoreRef.current) {
      skipNextRootSessionRestoreRef.current = false;
      hasRestoredRootRef.current = true;
      return;
    }

    const persistedProjectName = readPersistedString(LAST_SELECTED_PROJECT_KEY);
    const preferredProject = (
      (persistedProjectName ? projects.find((project) => project.name === persistedProjectName) : null) ??
      (projects.length === 1 ? projects[0] : null)
    );

    if (!preferredProject) {
      return;
    }

    hasRestoredRootRef.current = true;
    setSelectedProject(preferredProject);

    const preferredSession = getPreferredProjectSession(preferredProject, readLastSessionByProject());
    if (preferredSession) {
      setSelectedSession(preferredSession);
      navigate(`/session/${preferredSession.id}`);
    }
  }, [isLoadingProjects, navigate, projects, selectedSession, sessionId]);

  useEffect(() => {
    if (!selectedProject?.name) {
      return;
    }

    persistProjectSelection(selectedProject.name);
  }, [persistProjectSelection, selectedProject?.name]);

  useEffect(() => {
    const resolvedProjectName =
      selectedSession?.__projectName ||
      (
        selectedProject && sessionId && findProjectSessionById(selectedProject, sessionId)
          ? selectedProject.name
          : null
      );
    const resolvedSessionId =
      selectedSession?.id ||
      (
        selectedProject && sessionId && findProjectSessionById(selectedProject, sessionId)
          ? sessionId
          : null
      );

    if (!resolvedProjectName || !resolvedSessionId) {
      return;
    }

    persistSessionSelection(resolvedProjectName, resolvedSessionId);
  }, [persistSessionSelection, selectedProject, selectedSession?.__projectName, selectedSession?.id, sessionId]);

  useEffect(() => {
    if (!latestMessage) {
      return;
    }

    if (latestMessage.type === 'loading_progress') {
      if (loadingProgressTimeoutRef.current) {
        clearTimeout(loadingProgressTimeoutRef.current);
        loadingProgressTimeoutRef.current = null;
      }

      setLoadingProgress(latestMessage as LoadingProgress);

      if (latestMessage.phase === 'complete') {
        loadingProgressTimeoutRef.current = setTimeout(() => {
          setLoadingProgress(null);
          loadingProgressTimeoutRef.current = null;
        }, 500);
      }

      return;
    }

    if (latestMessage.type !== 'projects_updated') {
      return;
    }

    const projectsMessage = latestMessage as ProjectsUpdatedMessage;

    if (projectsMessage.changedFile && selectedSession && selectedProject) {
      const normalized = projectsMessage.changedFile.replace(/\\/g, '/');
      const changedFileParts = normalized.split('/');

      if (changedFileParts.length >= 2) {
        const filename = changedFileParts[changedFileParts.length - 1];
        const changedSessionId = filename.replace('.jsonl', '');

        if (changedSessionId === selectedSession.id) {
          const isSessionActive = activeSessions.has(selectedSession.id);

          if (!isSessionActive) {
            setExternalMessageUpdate((prev) => prev + 1);
          }
        }
      }
    }

    const hasActiveSession =
      (selectedSession && activeSessions.has(selectedSession.id)) ||
      (activeSessions.size > 0 && Array.from(activeSessions).some((id) => id.startsWith('new-session-')));

    const updatedProjects = projectsMessage.projects;

    if (
      hasActiveSession &&
      !isUpdateAdditive(projects, updatedProjects, selectedProject, selectedSession)
    ) {
      return;
    }

    setProjects(updatedProjects);

    if (!selectedProject) {
      return;
    }

    const updatedSelectedProject = updatedProjects.find(
      (project) => project.name === selectedProject.name,
    );

    if (!updatedSelectedProject) {
      return;
    }

    if (serialize(updatedSelectedProject) !== serialize(selectedProject)) {
      setSelectedProject(updatedSelectedProject);
    }

    if (!selectedSession) {
      return;
    }

    const updatedSelectedSession = getProjectSessions(updatedSelectedProject).find(
      (session) => session.id === selectedSession.id,
    );

    if (!updatedSelectedSession) {
      setSelectedSession(null);
    }
  }, [latestMessage, selectedProject, selectedSession, activeSessions, projects]);

  useEffect(() => {
    return () => {
      if (loadingProgressTimeoutRef.current) {
        clearTimeout(loadingProgressTimeoutRef.current);
        loadingProgressTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionId || projects.length === 0) {
      return;
    }

    for (const project of projects) {
      const claudeSession = project.sessions?.find((session) => session.id === sessionId);
      if (claudeSession) {
        const shouldUpdateProject = selectedProject?.name !== project.name;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== 'claude';

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...claudeSession, __provider: 'claude' });
        }
        return;
      }

      const cursorSession = project.cursorSessions?.find((session) => session.id === sessionId);
      if (cursorSession) {
        const shouldUpdateProject = selectedProject?.name !== project.name;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== 'cursor';

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...cursorSession, __provider: 'cursor' });
        }
        return;
      }

      const codexSession = project.codexSessions?.find((session) => session.id === sessionId);
      if (codexSession) {
        const shouldUpdateProject = selectedProject?.name !== project.name;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== 'codex';

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...codexSession, __provider: 'codex' });
        }
        return;
      }

      const geminiSession = project.geminiSessions?.find((session) => session.id === sessionId);
      if (geminiSession) {
        const shouldUpdateProject = selectedProject?.name !== project.name;
        const shouldUpdateSession =
          selectedSession?.id !== sessionId || selectedSession.__provider !== 'gemini';

        if (shouldUpdateProject) {
          setSelectedProject(project);
        }
        if (shouldUpdateSession) {
          setSelectedSession({ ...geminiSession, __provider: 'gemini' });
        }
        return;
      }
    }
  }, [sessionId, projects, selectedProject?.name, selectedSession?.id, selectedSession?.__provider]);

  const handleProjectSelect = useCallback(
    (project: Project) => {
      const preferredSession = getPreferredProjectSession(project, readLastSessionByProject());

      setSelectedProject(project);
      persistProjectSelection(project.name);

      if (preferredSession) {
        setSelectedSession(preferredSession);
        persistSessionSelection(project.name, preferredSession.id);

        if (activeTab === 'tasks' || activeTab === 'preview') {
          setActiveTab('chat');
        }

        navigate(`/session/${preferredSession.id}`);
      } else {
        setSelectedSession(null);
        navigate('/');
      }

      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [activeTab, isMobile, navigate, persistProjectSelection, persistSessionSelection],
  );

  const handleSessionSelect = useCallback(
    (session: ProjectSession) => {
      skipNextRootSessionRestoreRef.current = false;
      const sessionProjectName = session.__projectName || selectedProject?.name || null;

      setSelectedSession(session);
      if (sessionProjectName) {
        persistProjectSelection(sessionProjectName);
        persistSessionSelection(sessionProjectName, session.id);
      }

      if (activeTab === 'tasks' || activeTab === 'preview') {
        setActiveTab('chat');
      }

      const provider = session.__provider || 'claude';
      if (provider === 'cursor') {
        sessionStorage.setItem('cursorSessionId', session.id);
      }

      if (isMobile) {
        const sessionProjectName = session.__projectName;
        const currentProjectName = selectedProject?.name;

        if (sessionProjectName !== currentProjectName) {
          setSidebarOpen(false);
        }
      }

      navigate(`/session/${session.id}`);
    },
    [activeTab, isMobile, navigate, persistProjectSelection, persistSessionSelection, selectedProject?.name],
  );

  const handleNewSession = useCallback(
    (project: Project) => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingSessionId');
        sessionStorage.removeItem('cursorSessionId');
      }
      console.log('[SessionDebug][Projects] new session clicked', {
        projectName: project.name,
        previousSelectedProject: selectedProject?.name ?? null,
        previousSelectedSessionId: selectedSession?.id ?? null,
        currentPath: typeof window !== 'undefined' ? window.location.pathname : null,
      });
      skipNextRootSessionRestoreRef.current = true;
      hasRestoredRootRef.current = false;
      setSelectedProject(project);
      setSelectedSession(null);
      persistProjectSelection(project.name);
      setActiveTab('chat');
      navigate('/');

      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile, navigate, persistProjectSelection, selectedProject?.name, selectedSession?.id],
  );

  const handleSessionDelete = useCallback(
    (sessionIdToDelete: string) => {
      projectsMutationVersionRef.current += 1;

      if (selectedSession?.id === sessionIdToDelete) {
        setSelectedSession(null);
        navigate('/');
      }

      clearPersistedSessionSelection(sessionIdToDelete);

      setProjects((prevProjects) =>
        prevProjects.map((project) => ({
          ...project,
          sessions: project.sessions?.filter((session) => session.id !== sessionIdToDelete) ?? [],
          cursorSessions: project.cursorSessions?.filter((session) => session.id !== sessionIdToDelete) ?? [],
          codexSessions: project.codexSessions?.filter((session) => session.id !== sessionIdToDelete) ?? [],
          geminiSessions: project.geminiSessions?.filter((session) => session.id !== sessionIdToDelete) ?? [],
          sessionMeta: {
            ...project.sessionMeta,
            total: Math.max(
              0,
              (project.sessionMeta?.total as number | undefined ?? 0) -
              (project.sessions?.some((session) => session.id === sessionIdToDelete) ? 1 : 0),
            ),
          },
        })),
      );
    },
    [clearPersistedSessionSelection, navigate, selectedSession?.id],
  );

  const handleSidebarRefresh = useCallback(async () => {
    try {
      const response = await api.projects();
      const freshProjects = (await response.json()) as Project[];

      setProjects((prevProjects) =>
        projectsHaveChanges(prevProjects, freshProjects, true) ? freshProjects : prevProjects,
      );

      if (!selectedProject) {
        return;
      }

      const refreshedProject = freshProjects.find((project) => project.name === selectedProject.name);
      if (!refreshedProject) {
        return;
      }

      if (serialize(refreshedProject) !== serialize(selectedProject)) {
        setSelectedProject(refreshedProject);
      }

      if (!selectedSession) {
        return;
      }

      const refreshedSession = getProjectSessions(refreshedProject).find(
        (session) => session.id === selectedSession.id,
      );

      if (refreshedSession) {
        // Keep provider metadata stable when refreshed payload doesn't include __provider.
        const normalizedRefreshedSession =
          refreshedSession.__provider || !selectedSession.__provider
            ? refreshedSession
            : { ...refreshedSession, __provider: selectedSession.__provider };

        if (serialize(normalizedRefreshedSession) !== serialize(selectedSession)) {
          setSelectedSession(normalizedRefreshedSession);
        }
      }
    } catch (error) {
      console.error('Error refreshing sidebar:', error);
    }
  }, [selectedProject, selectedSession]);

  const handleProjectDelete = useCallback(
    (projectName: string) => {
      projectsMutationVersionRef.current += 1;

      if (selectedProject?.name === projectName) {
        setSelectedProject(null);
        setSelectedSession(null);
        navigate('/');
      }

      clearPersistedProjectSelection(projectName);
      setProjects((prevProjects) => prevProjects.filter((project) => project.name !== projectName));
    },
    [clearPersistedProjectSelection, navigate, selectedProject?.name],
  );

  const sidebarSharedProps = useMemo(
    () => ({
      projects,
      selectedProject,
      selectedSession,
      onProjectSelect: handleProjectSelect,
      onSessionSelect: handleSessionSelect,
      onNewSession: handleNewSession,
      onSessionDelete: handleSessionDelete,
      onProjectDelete: handleProjectDelete,
      isLoading: isLoadingProjects,
      loadingProgress,
      onRefresh: handleSidebarRefresh,
      onShowSettings: () => setShowSettings(true),
      showSettings,
      settingsInitialTab,
      onCloseSettings: () => setShowSettings(false),
      isMobile,
    }),
    [
      handleNewSession,
      handleProjectDelete,
      handleProjectSelect,
      handleSessionDelete,
      handleSessionSelect,
      handleSidebarRefresh,
      isLoadingProjects,
      isMobile,
      loadingProgress,
      projects,
      settingsInitialTab,
      selectedProject,
      selectedSession,
      showSettings,
    ],
  );

  return {
    projects,
    selectedProject,
    selectedSession,
    activeTab,
    sidebarOpen,
    isLoadingProjects,
    loadingProgress,
    isInputFocused,
    showSettings,
    settingsInitialTab,
    externalMessageUpdate,
    setActiveTab,
    setSidebarOpen,
    setIsInputFocused,
    setShowSettings,
    openSettings,
    fetchProjects,
    refreshProjectsSilently,
    sidebarSharedProps,
    handleProjectSelect,
    handleSessionSelect,
    handleNewSession,
    handleSessionDelete,
    handleProjectDelete,
    handleSidebarRefresh,
  };
}
