import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSessionIdFromPathname,
  resolveActiveViewSessionId,
  resolveComposerSessionId,
} from './sessionResolution.js';

test('uses route session id when selected session is not restored yet', () => {
  assert.equal(
    resolveComposerSessionId({
      selectedSession: null,
      currentSessionId: null,
      pendingViewSessionId: null,
      pendingSessionId: null,
      cursorSessionId: null,
      routeSessionId: 'codex-session-123',
      provider: 'codex',
    }),
    'codex-session-123',
  );
});

test('does not resume stale concrete current session on the root new-session view', () => {
  assert.equal(
    resolveComposerSessionId({
      selectedSession: { id: 'previous-session' },
      currentSessionId: 'previous-session',
      pendingViewSessionId: null,
      pendingSessionId: null,
      cursorSessionId: null,
      routeSessionId: null,
      provider: 'codex',
    }),
    null,
  );
});

test('does not resume stale pending session storage on the root new-session view', () => {
  assert.equal(
    resolveComposerSessionId({
      selectedSession: null,
      currentSessionId: null,
      pendingViewSessionId: null,
      pendingSessionId: 'deleted-session',
      cursorSessionId: null,
      routeSessionId: null,
      provider: 'codex',
    }),
    null,
  );
});

test('does not render stale pending session storage on the root new-session view', () => {
  assert.equal(
    resolveActiveViewSessionId({
      selectedSession: null,
      currentSessionId: null,
      pendingViewSessionId: null,
      pendingSessionId: 'deleted-session',
      routeSessionId: null,
    }),
    null,
  );
});

test('extracts route session id from session paths', () => {
  assert.equal(getSessionIdFromPathname('/session/codex-session-123'), 'codex-session-123');
  assert.equal(getSessionIdFromPathname('/'), null);
});
