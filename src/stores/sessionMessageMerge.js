const OPTIMISTIC_LOCAL_ID_PREFIX = 'local_';
const OPTIMISTIC_DUPLICATE_WINDOW_MS = 30_000;
const PERSISTED_DUPLICATE_WINDOW_MS = 30_000;

function getTimestampMs(message) {
  const timestamp = Date.parse(message.timestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function normalizeComparableText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function summarizeMessage(message) {
  const content = typeof message.content === 'string' ? message.content : '';
  return {
    id: message.id,
    kind: message.kind,
    role: message.role ?? null,
    sessionId: message.sessionId,
    provider: message.provider,
    contentLength: content.length,
    preview: normalizeComparableText(content).slice(0, 120),
  };
}

function isTimestampNear(a, b, windowMs) {
  const aTs = getTimestampMs(a);
  const bTs = getTimestampMs(b);
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs)) {
    return true;
  }

  return Math.abs(aTs - bTs) <= windowMs;
}

function isOptimisticRealtimeDuplicate(realtimeMessage, serverMessage) {
  if (!realtimeMessage.id.startsWith(OPTIMISTIC_LOCAL_ID_PREFIX)) {
    return false;
  }

  if (realtimeMessage.kind !== 'text' || serverMessage.kind !== 'text') {
    return false;
  }

  if (realtimeMessage.role !== 'user' || serverMessage.role !== 'user') {
    return false;
  }

  const realtimeContent = normalizeComparableText(realtimeMessage.content);
  const serverContent = normalizeComparableText(serverMessage.content);
  if (!realtimeContent || realtimeContent !== serverContent) {
    return false;
  }

  return isTimestampNear(realtimeMessage, serverMessage, OPTIMISTIC_DUPLICATE_WINDOW_MS);
}

function isPersistedRealtimeTextDuplicate(realtimeMessage, serverMessage) {
  if (realtimeMessage.kind !== 'text' || serverMessage.kind !== 'text') {
    return false;
  }

  if (realtimeMessage.role !== serverMessage.role) {
    return false;
  }

  const realtimeContent = normalizeComparableText(realtimeMessage.content);
  const serverContent = normalizeComparableText(serverMessage.content);
  if (!realtimeContent || realtimeContent !== serverContent) {
    return false;
  }

  return isTimestampNear(realtimeMessage, serverMessage, PERSISTED_DUPLICATE_WINDOW_MS);
}

function sortMessagesChronologically(messages) {
  if (messages.length < 2) return messages;

  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const aTs = getTimestampMs(a.message);
      const bTs = getTimestampMs(b.message);
      const aHasTs = Number.isFinite(aTs);
      const bHasTs = Number.isFinite(bTs);

      if (aHasTs && bHasTs && aTs !== bTs) {
        return aTs - bTs;
      }
      if (aHasTs !== bHasTs) {
        return aHasTs ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

export function computeMergedMessages(server, realtime, logger = console) {
  if (realtime.length === 0) return server;
  if (server.length === 0) return sortMessagesChronologically(realtime);

  const serverIds = new Set(server.map(m => m.id));
  const extra = realtime.filter((message) => {
    if (serverIds.has(message.id)) {
      logger.log('[DupDebug][Client][SessionStore] drop realtime duplicate id', {
        realtime: summarizeMessage(message),
      });
      return false;
    }

    const optimisticDuplicate = server.find((serverMessage) => isOptimisticRealtimeDuplicate(message, serverMessage));
    if (optimisticDuplicate) {
      logger.log('[DupDebug][Client][SessionStore] drop optimistic user duplicate', {
        realtime: summarizeMessage(message),
        server: summarizeMessage(optimisticDuplicate),
      });
      return false;
    }

    const persistedDuplicate = server.find((serverMessage) => isPersistedRealtimeTextDuplicate(message, serverMessage));
    if (persistedDuplicate) {
      logger.log('[DupDebug][Client][SessionStore] drop persisted text duplicate', {
        realtime: summarizeMessage(message),
        server: summarizeMessage(persistedDuplicate),
      });
      return false;
    }

    return true;
  });

  logger.log('[DupDebug][Client][SessionStore] computeMerged', {
    serverCount: server.length,
    realtimeCount: realtime.length,
    extraCount: extra.length,
    mergedCount: server.length + extra.length,
  });

  if (extra.length === 0) return server;
  return sortMessagesChronologically([...server, ...extra]);
}

export { normalizeComparableText, summarizeMessage };
