import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCodexThreadStart } from './codex-session-resolution.js';
import { getCodexEventThreadId } from './codex-event-utils.js';

test('extracts the SDK thread id from thread.started events', () => {
  assert.equal(
    getCodexEventThreadId({ type: 'thread.started', thread_id: 'actual-thread-id' }),
    'actual-thread-id',
  );
});

test('keeps compatibility with legacy thread id field names', () => {
  assert.equal(getCodexEventThreadId({ type: 'thread.started', threadId: 'camel-thread-id' }), 'camel-thread-id');
  assert.equal(getCodexEventThreadId({ type: 'thread.started', id: 'legacy-thread-id' }), 'legacy-thread-id');
});

test('starts a new Codex thread when requested resume session is missing', () => {
  assert.deepEqual(
    resolveCodexThreadStart({
      requestedSessionId: 'deleted-session',
      sessionExists: false,
    }),
    {
      action: 'new',
      resumeSessionId: null,
      staleRequestedSessionId: 'deleted-session',
    },
  );
});

test('resumes Codex thread when requested session exists', () => {
  assert.deepEqual(
    resolveCodexThreadStart({
      requestedSessionId: 'existing-session',
      sessionExists: true,
    }),
    {
      action: 'resume',
      resumeSessionId: 'existing-session',
      staleRequestedSessionId: null,
    },
  );
});
