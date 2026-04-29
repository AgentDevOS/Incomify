import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-project-routes-'));

process.env.DATABASE_PATH = path.join(testRoot, 'projects-routes.test.db');
process.env.JWT_SECRET = 'projects-routes-test-secret';
process.env.DEPLOY_ROOT = path.join(testRoot, 'deploy');
process.env.DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

const projectsRouter = (await import('./projects.js')).default;
const { initializeDatabase, db, userDb, userProjectsDb } = await import('../database/db.js');

function createApp(userId) {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', (req, res, next) => {
    req.user = { id: userId };
    next();
  }, projectsRouter);
  return app;
}

async function request(app, pathName, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathName}`, options);
    const body = await response.json();
    return { status: response.status, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('project deployment routes', () => {
  before(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    await fs.rm(process.env.DEPLOY_ROOT, { recursive: true, force: true });
  });

  after(async () => {
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('POST /api/projects/:projectName/deployment/files publishes a project file', async () => {
    const user = userDb.createUser('project-route-file-user', 'password-hash');
    const projectPath = path.join(testRoot, 'route-project');
    const reportPath = path.join(projectPath, 'docs', 'test-report.md');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, '# Route Report\n');
    userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'route-project',
      projectPath,
      displayName: 'Route Project',
    });

    const response = await request(createApp(user.id), '/api/projects/route-project/deployment/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: reportPath }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.deployment.relativePath, 'docs/test-report.html');
    assert.match(response.body.deployment.publicUrl, /\/docs\/test-report\.html$/);
    assert.match(
      await fs.readFile(path.join(process.env.DEPLOY_ROOT, user.publicId, '1', 'docs', 'test-report.html'), 'utf8'),
      /<h1>Route Report<\/h1>/,
    );
  });

  test('POST /api/projects/:projectName/deployment/files rejects paths outside the project', async () => {
    const user = userDb.createUser('project-route-invalid-user', 'password-hash');
    const projectPath = path.join(testRoot, 'route-invalid-project');
    const outsidePath = path.join(testRoot, 'outside.md');
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(outsidePath, '# Outside\n');
    userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'route-invalid-project',
      projectPath,
      displayName: 'Route Invalid Project',
    });

    const response = await request(createApp(user.id), '/api/projects/route-invalid-project/deployment/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: outsidePath }),
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /within the project directory/);
  });
});
