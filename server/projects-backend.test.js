import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-projects-backend-'));

process.env.DATABASE_PATH = path.join(testRoot, 'projects-backend.test.db');
process.env.JWT_SECRET = 'projects-backend-test-secret';
process.env.WORKSPACES_ROOT = path.join(testRoot, 'workspaces');
process.env.PROJECT_BACKEND_PORT_START = '43200';
process.env.PROJECT_BACKEND_PORT_END = '43210';

const { initializeDatabase, db, userDb } = await import('./database/db.js');
const { closeDeploymentWatchers } = await import('./services/deployment-watcher.js');
const { addProjectManually } = await import('./projects.js');

describe('project backend creation', () => {
  before(async () => {
    await initializeDatabase();
  });

  after(async () => {
    await closeDeploymentWatchers();
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('adds a Rust backend when a user project is created manually', async () => {
    const user = userDb.createUser('project-backend-user', 'password-hash');
    const projectPath = path.join(testRoot, 'manual-project');
    await fs.mkdir(projectPath, { recursive: true });

    const project = await addProjectManually(projectPath, 'Manual Project', user.id);

    assert.equal(project.backend.language, 'rust');
    assert.equal(project.backend.port, 43200);
    assert.equal(project.backend.path, path.join(projectPath, 'src', 'backend'));
    assert.equal(
      await fs.readFile(path.join(projectPath, 'src', 'backend', '.env'), 'utf8'),
      'BACKEND_PORT=43200\n',
    );
    assert.match(
      await fs.readFile(path.join(projectPath, 'src', 'backend', 'Cargo.toml'), 'utf8'),
      /name = "incomify-backend"/,
    );
  });
});
