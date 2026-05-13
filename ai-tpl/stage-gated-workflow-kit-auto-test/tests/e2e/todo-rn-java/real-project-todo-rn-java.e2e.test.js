'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createWorkspace, runNode } = require('../../shared/helpers');
const { RN_TODO_JAVA_SCENARIO } = require('../../shared/sdk-scenarios');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

test('真实流程：React Native Todo + Java 后端项目会通过 Claude CLI 留下完整产物', { timeout: 15 * 60 * 1000 }, () => {
  const workspace = createWorkspace(RN_TODO_JAVA_SCENARIO.workspacePrefix);
  const result = runNode(PROJECT_ROOT, ['scripts/run-claude-scenario.js', RN_TODO_JAVA_SCENARIO.id, workspace], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 20,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.scenarioId, RN_TODO_JAVA_SCENARIO.id);
  assert.equal(output.workspace, workspace);
  assert.equal(output.transcriptRounds, 4);
  assert.equal(typeof output.runStatePath, 'string');
  assert.equal(typeof output.runSummaryPath, 'string');

  const state = JSON.parse(fs.readFileSync(path.join(workspace, '.workflow', 'state.json'), 'utf8'));
  const audit = fs.readFileSync(path.join(workspace, '.workflow', 'audit.log'), 'utf8');
  const report = fs.readFileSync(path.join(workspace, 'docs', 'test-report.md'), 'utf8');
  const review = fs.readFileSync(path.join(workspace, 'docs', 'code-review.md'), 'utf8');
  const session = fs.readFileSync(path.join(workspace, 'docs', 'agent-session.md'), 'utf8');
  const dialogue = fs.readFileSync(path.join(workspace, 'docs', 'claude-code-dialogue.md'), 'utf8');
  const javaController = fs.readFileSync(path.join(workspace, 'src/backend/java/com/incomify/todo/TodoController.java'), 'utf8');
  const runSummary = JSON.parse(fs.readFileSync(path.join(workspace, '.workflow', 'claude-cli-run-summary.json'), 'utf8'));

  assert.equal(state.currentStage, RN_TODO_JAVA_SCENARIO.assertions.stateStage);
  assert.equal(state.history.length, RN_TODO_JAVA_SCENARIO.assertions.historyLength);
  assert.match(audit, /READY: development 请求确认/);
  assert.match(audit, /CONFIRM: delivery -> done/);
  assert.match(report, /### 4\. E2E 测试/);
  assert.match(report, /- 最终结论：通过/);
  assert.match(review, /- 审核结论：通过/);
  assert.match(session, /Java 后端/);
  assert.match(dialogue, /Save to Server/);
  assert.match(dialogue, /第 4 轮/);
  assert.match(javaController, /\/api\/todos/);
  assert.equal(runSummary.status, 'completed');
});
