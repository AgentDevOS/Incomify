import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-deployment-'));

process.env.DATABASE_PATH = path.join(testRoot, 'deployment.test.db');
process.env.JWT_SECRET = 'deployment-test-secret';

const {
  getDeployRoot,
  getProjectDeploymentInfo,
  ensureProjectDeployDirectories,
  publishProjectFileToDeployment,
} = await import('./deployment.js');
const { initializeDatabase, db, userDb } = await import('../database/db.js');

describe('deployment paths', () => {
  before(async () => {
    await initializeDatabase();
  });

  afterEach(() => {
    delete process.env.DEPLOY_ROOT;
    delete process.env.DEPLOY_BASE_URL;
  });

  after(async () => {
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('expands DEPLOY_ROOT from the current user home directory', () => {
    process.env.DEPLOY_ROOT = '~/workspace/deploy';

    assert.equal(getDeployRoot(), path.join(os.homedir(), 'workspace', 'deploy'));
  });

  test('defaults deploy root under the current user home directory', () => {
    assert.equal(getDeployRoot(), path.join(os.homedir(), 'workspace', 'deploy'));
  });

  test('marks prototype target available when source prototype index exists', async () => {
    process.env.DEPLOY_ROOT = path.join(testRoot, 'deploy-source');
    process.env.DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

    const user = userDb.createUser('deployment-source-user', 'password-hash');
    const projectPath = path.join(testRoot, 'source-project');
    await fs.mkdir(path.join(projectPath, 'prototype'), { recursive: true });
    await fs.writeFile(path.join(projectPath, 'prototype', 'index.html'), '<h1>Prototype</h1>');

    const deployment = await ensureProjectDeployDirectories({
      userId: user.id,
      projectId: 1,
      projectPath,
    });
    const prototypeTarget = deployment.targets.find((target) => target.type === 'prototype');

    assert.equal(prototypeTarget.available, true);
    assert.equal(prototypeTarget.sourceAvailable, true);
    assert.equal(prototypeTarget.deployedAvailable, false);
    assert.equal(
      prototypeTarget.url,
      `https://cx.incomify.com/aisoft/deploy/${user.publicId}/1/prototype/`,
    );
  });

  test('marks prototype target available when deployed prototype index exists', async () => {
    process.env.DEPLOY_ROOT = path.join(testRoot, 'deploy-target');
    process.env.DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

    const user = userDb.createUser('deployment-target-user', 'password-hash');
    await ensureProjectDeployDirectories({
      userId: user.id,
      projectId: 1,
    });
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, '1', 'prototype', 'index.html'),
      '<h1>Deployed Prototype</h1>',
    );

    const deployment = await getProjectDeploymentInfo({
      userId: user.id,
      projectId: 1,
    });
    const prototypeTarget = deployment.targets.find((target) => target.type === 'prototype');

    assert.equal(prototypeTarget.available, true);
    assert.equal(prototypeTarget.sourceAvailable, false);
    assert.equal(prototypeTarget.deployedAvailable, true);
  });

  test('publishes a project file into the project deploy root while preserving relative path', async () => {
    process.env.DEPLOY_ROOT = path.join(testRoot, 'deploy-files');
    process.env.DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

    const user = userDb.createUser('deployment-file-user', 'password-hash');
    const projectPath = path.join(testRoot, 'file-project');
    const reportPath = path.join(projectPath, 'docs', 'test-report.md');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, '# Test Report\n');

    const result = await publishProjectFileToDeployment({
      userId: user.id,
      projectId: 4,
      projectPath,
      sourcePath: reportPath,
    });

    const html = await fs.readFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, '4', 'docs', 'test-report.html'),
      'utf8',
    );

    assert.match(html, /<h1>Test Report<\/h1>/);
    assert.equal(
      result.publicUrl,
      `https://cx.incomify.com/aisoft/deploy/${user.publicId}/4/docs/test-report.html`,
    );
  });
});
