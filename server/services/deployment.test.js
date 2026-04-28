import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

process.env.DATABASE_PATH = path.join(os.tmpdir(), `incomify-deployment-${process.pid}.db`);
process.env.JWT_SECRET = 'deployment-test-secret';

const { getDeployRoot } = await import('./deployment.js');

describe('deployment paths', () => {
  afterEach(() => {
    delete process.env.DEPLOY_ROOT;
  });

  test('expands DEPLOY_ROOT from the current user home directory', () => {
    process.env.DEPLOY_ROOT = '~/workspace/deploy';

    assert.equal(getDeployRoot(), path.join(os.homedir(), 'workspace', 'deploy'));
  });

  test('defaults deploy root under the current user home directory', () => {
    assert.equal(getDeployRoot(), path.join(os.homedir(), 'workspace', 'deploy'));
  });
});
