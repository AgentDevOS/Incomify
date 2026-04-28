import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-project-backend-'));

process.env.DATABASE_PATH = path.join(testRoot, 'project-backend.test.db');
process.env.JWT_SECRET = 'project-backend-test-secret';
process.env.PROJECT_BACKEND_PORT_START = '43100';
process.env.PROJECT_BACKEND_PORT_END = '43105';

const { initializeDatabase, db, userDb, userProjectsDb, projectBackendsDb } = await import('../database/db.js');
const { provisionRustBackendForProject } = await import('./project-backend.js');

describe('project backend provisioning', () => {
  before(async () => {
    await initializeDatabase();
  });

  after(async () => {
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('creates a Rust axum backend and persists its port', async () => {
    const user = userDb.createUser('rust-backend-user', 'password-hash');
    const projectPath = path.join(testRoot, 'workspace');
    await fs.mkdir(projectPath, { recursive: true });
    const project = userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'workspace',
      projectPath,
      displayName: 'Workspace',
      source: 'manual',
    });

    const backend = await provisionRustBackendForProject({
      projectId: project.id,
      projectPath,
    });

    assert.equal(backend.language, 'rust');
    assert.equal(backend.port, 43100);
    assert.equal(backend.path, path.join(projectPath, 'src', 'backend'));
    assert.deepEqual(projectBackendsDb.getUsedPorts(), [43100]);
    assert.equal(
      await fs.readFile(path.join(projectPath, 'src', 'backend', '.env'), 'utf8'),
      'BACKEND_PORT=43100\n',
    );
    assert.match(
      await fs.readFile(path.join(projectPath, 'src', 'backend', 'Cargo.toml'), 'utf8'),
      /axum = /,
    );
    assert.match(
      await fs.readFile(path.join(projectPath, 'src', 'backend', 'src', 'main.rs'), 'utf8'),
      /GET \/health/,
    );
  });

  test('allocates a unique port for each project', async () => {
    const user = userDb.createUser('rust-backend-user-2', 'password-hash');
    const firstPath = path.join(testRoot, 'first');
    const secondPath = path.join(testRoot, 'second');
    await fs.mkdir(firstPath, { recursive: true });
    await fs.mkdir(secondPath, { recursive: true });
    const firstProject = userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'first',
      projectPath: firstPath,
      source: 'manual',
    });
    const secondProject = userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'second',
      projectPath: secondPath,
      source: 'manual',
    });

    const firstBackend = await provisionRustBackendForProject({
      projectId: firstProject.id,
      projectPath: firstPath,
    });
    const secondBackend = await provisionRustBackendForProject({
      projectId: secondProject.id,
      projectPath: secondPath,
    });

    assert.notEqual(firstBackend.port, secondBackend.port);
  });
});
