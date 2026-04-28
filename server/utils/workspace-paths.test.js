import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

import { getConfiguredWorkspacesRoot } from './workspace-paths.js';

describe('workspace path configuration', () => {
  afterEach(() => {
    delete process.env.WORKSPACES_ROOT;
  });

  test('expands WORKSPACES_ROOT from the current user home directory', () => {
    process.env.WORKSPACES_ROOT = '~/workspace';

    assert.equal(getConfiguredWorkspacesRoot(), path.join(os.homedir(), 'workspace'));
  });
});
