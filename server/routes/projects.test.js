import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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

const { installStageGatedWorkflowKit } = await import('./projects.js');

describe('project routes helpers', () => {
  before(async () => {
    await fs.mkdir(kitDir, { recursive: true });
    await fs.writeFile(path.join(kitDir, 'AGENTS.md'), '# Template agents\n', 'utf8');
  });

  after(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  test('installs only AGENTS.md from the stage-gated workflow kit', async () => {
    const targetProjectPath = path.join(testRoot, 'target-project');
    const progressMessages = [];

    await installStageGatedWorkflowKit(targetProjectPath, 'Example Project', (message) => {
      progressMessages.push(message);
    });

    assert.equal(
      await fs.readFile(path.join(targetProjectPath, 'AGENTS.md'), 'utf8'),
      '# Template agents\n',
    );
    await assert.rejects(
      fs.access(path.join(targetProjectPath, 'install-plan-a.sh')),
      { code: 'ENOENT' },
    );
    assert.deepEqual(progressMessages, ['Copied AGENTS.md']);
  });
});
