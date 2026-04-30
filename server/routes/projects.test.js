import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-projects-'));
const kitDir = path.join(testRoot, 'stage-gated-workflow-kit');
const dbPath = path.join(testRoot, 'projects.test.db');

process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = 'projects-test-secret';
process.env.STAGE_GATED_WORKFLOW_KIT_DIR = kitDir;
process.env.WORKSPACES_ROOT = path.join(testRoot, 'workspaces');

const { initializeDatabase, db, userDb, userProjectsDb, projectBackendsDb } = await import('../database/db.js');
const { projectBackendManager } = await import('../services/project-backend-manager.js');
const { default: projectsRouter, installStageGatedWorkflowKit } = await import('./projects.js');

async function writeKitFile(relativePath, content = '') {
  const targetPath = path.join(kitDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

async function createMinimalWorkflowKit() {
  await writeKitFile('AGENTS.md', '# Template agents\n');
  await writeKitFile('README.md', '# Template readme\n');
  await writeKitFile('PROJECT-INSTALL.md', '# Template install\n');
  await writeKitFile('package.json', JSON.stringify({
    private: true,
    scripts: {
      'sync:backend-api-paths': 'node scripts/workflow/sync-backend-api-paths.js',
    },
  }, null, 2));
  await writeKitFile('scripts/package.json', '{"type":"commonjs"}\n');
  await writeKitFile('scripts/run-all-tests.js');
  await writeKitFile('scripts/verify-prototype.js');
  await writeKitFile('scripts/test-verify-prototype.js');
  await writeKitFile('scripts/test-workflow-config.js');
  await writeKitFile('scripts/test-sync-backend-api-paths.js');
  await writeKitFile('scripts/workflow/config.js');
  await writeKitFile('scripts/workflow/config.cjs');
  await writeKitFile('scripts/workflow/state.js');
  await writeKitFile('scripts/workflow/state.cjs');
  await writeKitFile('scripts/workflow/doctor.js');
  await writeKitFile('scripts/workflow/sync-backend-api-paths.js');
  await writeKitFile('scripts/workflow/gate.js', `const fs = require('fs');
const path = require('path');
const [, , command, ...rest] = process.argv;
if (command !== 'init') process.exit(0);
fs.mkdirSync('.workflow', { recursive: true });
fs.writeFileSync(path.join('.workflow', 'state.json'), JSON.stringify({
  projectName: rest.join(' '),
  currentStage: 'requirements_analysis',
  awaitingApproval: false
}, null, 2) + '\\n');
`);
  await writeKitFile('scripts/hooks/workflow-stage-guard.js');
  await writeKitFile('scripts/hooks/workflow-stage-sync.js');
  await writeKitFile('scripts/hooks/workflow-session-start.js');
  await writeKitFile('scripts/hooks/workflow-session-end.js');
  await writeKitFile('skills/stage-gated-delivery/SKILL.md', '# Template skill\n');
  await writeKitFile('.workflow/state.example.json', '{}\n');
  await writeKitFile('.workflow/test-scenario.md', '# Test Scenario\n');
  await writeKitFile('.workflow/test-report.md', '# Test Report\n');
  await writeKitFile('.workflow/requirement-interview-template.md', '# Test Interview\n');
  await writeKitFile('.workflow/test-contract.example.json', '{}\n');
  await writeKitFile('.workflow/backend-contract.example.json', '{}\n');
  await writeKitFile('.workflow/e2e-report.example.json', '{}\n');
  await writeKitFile('.workflow/api-report.example.json', '{}\n');
}

function captureRawBody(req, _res, buffer) {
  req.rawBody = Buffer.from(buffer);
}

describe('project routes helpers', () => {
  before(async () => {
    await initializeDatabase();
    await createMinimalWorkflowKit();
  });

  after(async () => {
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('installs the Codex stage-gated workflow kit and initializes state', async () => {
    const targetProjectPath = path.join(testRoot, 'target-project');
    const progressMessages = [];

    await installStageGatedWorkflowKit(targetProjectPath, 'Example Project', (message) => {
      progressMessages.push(message);
    });

    assert.equal(
      await fs.readFile(path.join(targetProjectPath, 'AGENTS.md'), 'utf8'),
      '# Template agents\n',
    );
    await assert.rejects(fs.access(path.join(targetProjectPath, 'CLAUDE.md')), { code: 'ENOENT' });
    await assert.rejects(fs.access(path.join(targetProjectPath, '.claude', 'settings.json')), { code: 'ENOENT' });

    const state = JSON.parse(await fs.readFile(path.join(targetProjectPath, '.workflow', 'state.json'), 'utf8'));
    assert.equal(state.projectName, 'Example Project');
    assert.equal(state.currentStage, 'requirements_analysis');
    assert.deepEqual(progressMessages, ['Copied stage-gated workflow kit', 'Initialized stage-gated workflow']);
  });

  test('project backend proxy preserves urlencoded request bodies', async () => {
    let backendServer;
    let proxyServer;
    const originalEnsureRunning = projectBackendManager.ensureRunning;

    try {
      const receivedRequest = await new Promise((resolve, reject) => {
        const fail = (error) => {
          reject(error);
        };

        backendServer = http.createServer((req, res) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              contentType: req.headers['content-type'],
            });
          });
        });

        backendServer.listen(0, '127.0.0.1', async () => {
          try {
            const { port } = backendServer.address();
            const user = userDb.createUser('proxy-body-user', 'password-hash');
            const projectPath = path.join(testRoot, 'proxy-project');
            await fs.mkdir(projectPath, { recursive: true });
            const project = userProjectsDb.upsertProject({
              userId: user.id,
              projectName: 'proxy-project',
              projectPath,
              source: 'manual',
            });
            projectBackendsDb.createBackend({
              projectId: project.id,
              language: 'rust',
              port,
              backendPath: path.join(projectPath, 'src', 'backend'),
            });

            projectBackendManager.ensureRunning = async (backend) => ({
              ...backend,
              running: true,
              status: 'running',
            });

            const app = express();
            app.use(express.urlencoded({ extended: true, verify: captureRawBody }));
            app.use((req, _res, next) => {
              req.user = { id: user.id };
              next();
            });
            app.use('/api/projects', projectsRouter);

            proxyServer = app.listen(0, '127.0.0.1', async () => {
              const proxyPort = proxyServer.address().port;
              try {
                await fetch(`http://127.0.0.1:${proxyPort}/api/projects/proxy-project/backend/proxy/echo`, {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                  },
                  body: 'alpha=one&beta=two',
                });
              } catch (error) {
                fail(error);
              }
            });
          } catch (error) {
            fail(error);
          }
        });
      });

      assert.deepEqual(receivedRequest, {
        body: 'alpha=one&beta=two',
        contentType: 'application/x-www-form-urlencoded',
      });
    } finally {
      projectBackendManager.ensureRunning = originalEnsureRunning;
      backendServer?.close();
      proxyServer?.close();
    }
  });
});
