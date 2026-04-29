import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProjectSelectionStale,
  prunePersistedProjectSelections,
} from './projectPersistence.js';

function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
  };
}

test('removes persisted selections for projects no longer in the project list', () => {
  globalThis.localStorage = createMemoryStorage({
    lastSelectedProject: 'deleted-project',
    lastSessionByProject: JSON.stringify({
      'deleted-project': 'deleted-session',
      'kept-project': 'kept-session',
    }),
  });

  prunePersistedProjectSelections([{ name: 'kept-project' }]);

  assert.equal(globalThis.localStorage.getItem('lastSelectedProject'), null);
  assert.deepEqual(
    JSON.parse(globalThis.localStorage.getItem('lastSessionByProject')),
    { 'kept-project': 'kept-session' },
  );
});

test('detects when the selected project is missing from the current project list', () => {
  assert.equal(
    isProjectSelectionStale([{ name: 'kept-project' }], { name: 'deleted-project' }),
    true,
  );

  assert.equal(
    isProjectSelectionStale([{ name: 'kept-project' }], { name: 'kept-project' }),
    false,
  );
});
