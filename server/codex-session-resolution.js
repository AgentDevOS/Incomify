export function resolveCodexThreadStart({ requestedSessionId, sessionExists }) {
  if (!requestedSessionId) {
    return {
      action: 'new',
      resumeSessionId: null,
      staleRequestedSessionId: null,
    };
  }

  if (!sessionExists) {
    return {
      action: 'new',
      resumeSessionId: null,
      staleRequestedSessionId: requestedSessionId,
    };
  }

  return {
    action: 'resume',
    resumeSessionId: requestedSessionId,
    staleRequestedSessionId: null,
  };
}
