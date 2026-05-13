'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  createWorkspace,
  ensureFile,
  readJson,
  readText,
  runGate,
} = require('../shared/helpers');

const TEMPLATE_ROOT = path.resolve(__dirname, '..', '..', '..', 'stage-gated-workflow-kit');

function buildRequirementDoc() {
  return [
    '# 需求文档',
    '',
    '## 项目概述',
    '',
    '- 项目名称：模板测试项目',
    '',
    '## 功能需求',
    '',
    '- 支持需求阶段校验',
    '',
    '## 用户使用场景',
    '',
    '- 用户查看阶段状态',
    '',
    '## 验收范围',
    '',
    '- 需求文档可进入 ready',
    '',
    '## 非目标',
    '',
    '- 暂不进入开发阶段',
    '',
    '## 需求澄清',
    '',
    '- 技术栈使用 Node',
    '',
  ].join('\n');
}

test('init 会创建初始状态并进入需求分析阶段', () => {
  const workspace = createWorkspace();
  const result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  const state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.projectName, '模板测试项目');
  assert.equal(state.currentStage, 'requirements_analysis');
  assert.equal(state.awaitingApproval, false);
});

test('requirements_analysis 阶段缺少必要文件时 ready 应失败', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);

  const result = runGate(workspace, ['ready', '--summary', '需求完成']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /docs\/requirement\.md/);
});

test('requirements_analysis 阶段补齐 requirement 文档后可以进入等待确认', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);
  ensureFile(workspace, 'docs/requirement.md', buildRequirementDoc());

  const result = runGate(workspace, ['ready', '--summary', '需求完成']);
  assert.equal(result.status, 0, result.stderr);

  const state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.awaitingApproval, true);
  assert.equal(state.pendingApproval.summary, '需求完成');
});

test('requirements_analysis 阶段文档缺少必需章节时 ready 应失败', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);
  ensureFile(workspace, 'docs/requirement.md', '# 需求文档\n\n## 项目概述\n');

  const result = runGate(workspace, ['ready', '--summary', '需求完成']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /缺少必需章节/);
});

test('init 会创建阶段记忆文件与基线快照', () => {
  const workspace = createWorkspace();
  const result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(Boolean(readJson(workspace, '.workflow/stage-baselines/requirements_analysis.json').files), true);
  assert.equal(/# 决策记录/.test(require('fs').readFileSync(require('path').join(workspace, '.workflow/decisions.md'), 'utf8')), true);
});

test('模板说明应覆盖 /brainstorming -> /writing-plans -> /executing-plans 命令流', () => {
  const files = [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'PROJECT-INSTALL.md',
    'skills/stage-gated-delivery/SKILL.md',
    '.workflow/test-scenario.md',
    'scripts/workflow/config.js',
    'scripts/workflow/sdk-stage-test.mjs',
  ];

  files.forEach(relativePath => {
    const text = readText(path.join(TEMPLATE_ROOT, relativePath));
    assert.match(text, /\/brainstorming/);
    assert.match(text, /\/writing-plans/);
    assert.match(text, /\/executing-plans/);
  });
});

test('模板说明应要求隔离分支完成后默认自动合回 dev', () => {
  const text = readText(path.join(TEMPLATE_ROOT, 'AGENTS.md'));

  assert.match(text, /完成后的默认合入规则/);
  assert.match(text, /隔离 worktree|功能分支/);
  assert.match(text, /自动合回当前 `dev`/);
  assert.match(text, /不应.*再次要求用户选择/);
  assert.match(text, /合并后.*`dev`.*重新运行/);
});
