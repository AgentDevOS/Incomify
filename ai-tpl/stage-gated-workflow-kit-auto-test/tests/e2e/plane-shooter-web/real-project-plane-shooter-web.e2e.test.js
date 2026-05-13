'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createWorkspace, runNode } = require('../../shared/helpers');
const { PLANE_SHOOTER_WEB_SCENARIO } = require('../../shared/sdk-scenarios');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

test('真实流程：网页飞机战斗游戏项目会通过 Claude CLI 保存复审资产', { timeout: 15 * 60 * 1000 }, () => {
  const workspace = createWorkspace(PLANE_SHOOTER_WEB_SCENARIO.workspacePrefix);
  const result = runNode(PROJECT_ROOT, ['scripts/run-claude-scenario.js', PLANE_SHOOTER_WEB_SCENARIO.id, workspace], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 20,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.scenarioId, PLANE_SHOOTER_WEB_SCENARIO.id);
  assert.equal(output.workspace, workspace);
  assert.equal(output.transcriptRounds, 4);
  assert.equal(typeof output.runStatePath, 'string');
  assert.equal(typeof output.runSummaryPath, 'string');

  const state = JSON.parse(fs.readFileSync(path.join(workspace, '.workflow', 'state.json'), 'utf8'));
  const audit = fs.readFileSync(path.join(workspace, '.workflow', 'audit.log'), 'utf8');
  const report = fs.readFileSync(path.join(workspace, 'docs', 'test-report.md'), 'utf8');
  const delivery = fs.readFileSync(path.join(workspace, 'docs', 'delivery.md'), 'utf8');
  const scoreController = fs.readFileSync(path.join(workspace, 'src/backend/java/com/incomify/shooter/ScoreController.java'), 'utf8');
  const dialogue = fs.readFileSync(path.join(workspace, 'docs', 'claude-code-dialogue.md'), 'utf8');
  const runSummary = JSON.parse(fs.readFileSync(path.join(workspace, '.workflow', 'claude-cli-run-summary.json'), 'utf8'));

  assert.equal(state.currentStage, PLANE_SHOOTER_WEB_SCENARIO.assertions.stateStage);
  assert.equal(state.history.length, PLANE_SHOOTER_WEB_SCENARIO.assertions.historyLength);
  assert.match(audit, /READY: development 请求确认/);
  assert.match(audit, /CONFIRM: delivery -> done/);
  assert.match(report, /### 3\. 集成测试/);
  assert.match(report, /### 6\. 构建检查/);
  assert.match(delivery, /交付物/);
  assert.match(scoreController, /\/api\/scores/);
  assert.match(dialogue, /第 4 轮/);
  assert.match(dialogue, /整个过程也要像人和 Claude Code 对话一样保存下来/);
  assert.equal(runSummary.status, 'completed');
});
