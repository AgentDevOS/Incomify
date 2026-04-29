import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incomify-workflow-kit-'));
const kitRoot = path.join(testRoot, 'stage-gated-workflow-kit');

process.env.DATABASE_PATH = path.join(testRoot, 'workflow-kit.test.db');
process.env.JWT_SECRET = 'workflow-kit-test-secret';
process.env.WORKSPACES_ROOT = path.join(testRoot, 'workspaces');
process.env.STAGE_GATED_WORKFLOW_KIT_DIR = kitRoot;

async function writeFile(relativePath, content = '') {
  const targetPath = path.join(kitRoot, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

async function createMinimalWorkflowKit() {
  await writeFile('AGENTS.md', '# Test Agents\n');
  await writeFile('README.md', '# Test Readme\n');
  await writeFile('PROJECT-INSTALL.md', '# Test Install\n');
  await writeFile('package.json', JSON.stringify({
    private: true,
    scripts: {
      'sync:backend-api-paths': 'node scripts/workflow/sync-backend-api-paths.js',
    },
  }, null, 2));
  await writeFile('scripts/package.json', '{"type":"commonjs"}\n');
  await writeFile('scripts/run-all-tests.js', '');
  await writeFile('scripts/verify-prototype.js', '');
  await writeFile('scripts/test-verify-prototype.js', '');
  await writeFile('scripts/test-workflow-config.js', '');
  await writeFile('scripts/test-sync-backend-api-paths.js', '');
  await writeFile('scripts/workflow/config.js', '');
  await writeFile('scripts/workflow/config.cjs', '');
  await writeFile('scripts/workflow/state.js', '');
  await writeFile('scripts/workflow/state.cjs', '');
  await writeFile('scripts/workflow/doctor.js', '');
  await writeFile('scripts/workflow/sync-backend-api-paths.js', '');
  await writeFile('scripts/workflow/gate.js', `const fs = require('fs');
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
  await writeFile('scripts/hooks/workflow-stage-guard.js', '');
  await writeFile('scripts/hooks/workflow-stage-sync.js', '');
  await writeFile('scripts/hooks/workflow-session-start.js', '');
  await writeFile('scripts/hooks/workflow-session-end.js', '');
  await writeFile('skills/stage-gated-delivery/SKILL.md', '# Test Skill\n');
  await writeFile('.workflow/state.example.json', '{}\n');
  await writeFile('.workflow/test-scenario.md', '# Test Scenario\n');
  await writeFile('.workflow/test-report.md', '# Test Report\n');
  await writeFile('.workflow/requirement-interview-template.md', '# Test Interview\n');
  await writeFile('.workflow/test-contract.example.json', '{}\n');
  await writeFile('.workflow/backend-contract.example.json', '{}\n');
  await writeFile('.workflow/e2e-report.example.json', '{}\n');
  await writeFile('.workflow/api-report.example.json', '{}\n');
}

const { initializeDatabase, db } = await import('./database/db.js');
const { closeDeploymentWatchers } = await import('./services/deployment-watcher.js');
const { installStageGatedWorkflowKit } = await import('./routes/projects.js');

describe('stage-gated workflow kit installation', () => {
  before(async () => {
    await createMinimalWorkflowKit();
    await initializeDatabase();
  });

  after(async () => {
    await closeDeploymentWatchers();
    db.close();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('installs the full workflow kit and initializes state for an empty project', async () => {
    const targetProjectPath = path.join(testRoot, 'empty-project');
    await fs.mkdir(targetProjectPath, { recursive: true });

    await installStageGatedWorkflowKit(targetProjectPath, 'Workflow Project');

    assert.equal(await fs.readFile(path.join(targetProjectPath, 'AGENTS.md'), 'utf8'), '# Test Agents\n');
    assert.equal(await fs.readFile(path.join(targetProjectPath, 'scripts', 'package.json'), 'utf8'), '{"type":"commonjs"}\n');
    assert.equal(await fs.readFile(path.join(targetProjectPath, '.workflow', 'api-report.example.json'), 'utf8'), '{}\n');

    const state = JSON.parse(await fs.readFile(path.join(targetProjectPath, '.workflow', 'state.json'), 'utf8'));
    assert.equal(state.projectName, 'Workflow Project');
    assert.equal(state.currentStage, 'requirements_analysis');
  });
});
