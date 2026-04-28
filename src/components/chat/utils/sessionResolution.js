const TEMPORARY_SESSION_PREFIX = 'new-session-';

export const isTemporarySessionId = (sessionId) =>
  Boolean(sessionId && sessionId.startsWith(TEMPORARY_SESSION_PREFIX));

export function getSessionIdFromPathname(pathname) {
  if (typeof pathname !== 'string') {
    return null;
  }

  const match = pathname.match(/\/session\/([^/?#]+)(?:[/?#]|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function resolveComposerSessionId({
  selectedSession,
  currentSessionId,
  pendingViewSessionId,
  pendingSessionId,
  cursorSessionId,
  routeSessionId,
  provider,
}) {
  if (!routeSessionId) {
    if (isTemporarySessionId(currentSessionId)) {
      return currentSessionId;
    }

    if (pendingViewSessionId) {
      return pendingViewSessionId;
    }

    return null;
  }

  if (selectedSession?.id) {
    return selectedSession.id;
  }

  if (!isTemporarySessionId(routeSessionId)) {
    return routeSessionId;
  }

  if (
    currentSessionId &&
    (
      isTemporarySessionId(currentSessionId) ||
      currentSessionId === pendingViewSessionId ||
      currentSessionId === pendingSessionId
    )
  ) {
    return currentSessionId;
  }

  if (pendingViewSessionId) {
    return pendingViewSessionId;
  }

  if (pendingSessionId) {
    return pendingSessionId;
  }

  if (provider === 'cursor') {
    return cursorSessionId;
  }

  return null;
}

export function resolveActiveViewSessionId({
  selectedSession,
  currentSessionId,
  pendingViewSessionId,
  pendingSessionId,
  routeSessionId,
}) {
  if (!routeSessionId) {
    if (isTemporarySessionId(currentSessionId)) {
      return currentSessionId;
    }

    if (pendingViewSessionId) {
      return pendingViewSessionId;
    }

    return null;
  }

  if (selectedSession?.id) {
    return selectedSession.id;
  }

  if (!isTemporarySessionId(routeSessionId)) {
    return routeSessionId;
  }

  if (
    currentSessionId &&
    (
      isTemporarySessionId(currentSessionId) ||
      currentSessionId === pendingViewSessionId ||
      currentSessionId === pendingSessionId
    )
  ) {
    return currentSessionId;
  }

  if (pendingViewSessionId) {
    return pendingViewSessionId;
  }

  if (pendingSessionId) {
    return pendingSessionId;
  }

  return null;
}
