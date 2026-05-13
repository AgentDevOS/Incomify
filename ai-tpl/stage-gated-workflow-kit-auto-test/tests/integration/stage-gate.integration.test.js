'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  createWorkspace,
  ensureFile,
  readJson,
  runGate,
  runConfiguredHook,
  runStageGuard,
} = require('../shared/helpers');

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
    '- 支持阶段门控',
    '',
    '## 用户使用场景',
    '',
    '- 用户确认当前阶段',
    '',
    '## 验收范围',
    '',
    '- 需求和原型阶段可推进',
    '',
    '## 非目标',
    '',
    '- 暂不发布',
    '',
    '## 需求澄清',
    '',
    '- 技术栈使用 Node',
    '',
  ].join('\n');
}

function buildPrototypeDoc() {
  return [
    '# 原型说明',
    '',
    '## 页面清单',
    '',
    '- prototype/index.html',
    '',
    '## 关键交互',
    '',
    '- 点击按钮进入下一步',
    '',
    '## 验证方式',
    '',
    '- 打开 prototype/index.html 操作按钮',
    '',
  ].join('\n');
}

function buildPrototypeHtml() {
  return [
    '<!doctype html>',
    '<html>',
    '<body>',
    '  <main>',
    '    <input aria-label="value" />',
    '    <button id="next-button" type="button">ok</button>',
    '    <output id="status"></output>',
    '  </main>',
    '  <script>',
    "    document.getElementById('next-button').addEventListener('click', function () {",
    "      document.getElementById('status').textContent = 'clicked';",
    '    });',
    '  </script>',
    '</body>',
    '</html>',
  ].join('\n');
}

function buildDeliveryDoc() {
  return [
    '# 交付说明',
    '',
    '## 交付物',
    '',
    '- docs/delivery.md',
    '',
    '## 启动方式',
    '',
    '- npm run test:all',
    '',
    '## 已知风险',
    '',
    '- 示例项目未接入真实发布流程',
    '',
  ].join('\n');
}

function buildCodeReviewDoc() {
  return [
    '# 代码审核报告',
    '',
    '## 概览',
    '',
    '- 审核结论：通过',
    '',
    '## 审核标准',
    '',
    '- 检查安全、质量和可维护性',
    '',
    '## 审核摘要',
    '',
    '- 未发现阻断问题',
    '',
  ].join('\n');
}

function buildTestReportMarkdown() {
  return [
    '# 测试报告',
    '',
    '## 概览',
    '',
    '- 最终结论：通过',
    '',
    '## 验证等级',
    '',
    '- 验证等级：LIGHT',
    '- 评估原因：改动范围较小且测试覆盖完整',
    '- 改动文件数：3',
    '- 估算改动行数：80',
    '- 证据要求：结构化诊断结果干净 + 关键测试通过',
    '- 警告：无',
    '',
    '### 1. 静态检查',
    '- 执行结果：通过',
    '',
    '### 2. 单元测试',
    '- 执行结果：通过',
    '',
    '### 3. 集成测试',
    '- 执行结果：通过',
    '',
    '### 4. E2E 测试',
    '- 执行结果：通过',
    '',
    '### 5. 代码审核',
    '- 执行结果：通过',
    '',
    '### 6. 构建检查',
    '- 执行结果：通过',
    '',
  ].join('\n');
}

function createValidDevelopmentEvidence(workspace, overrides = {}) {
  const reportJson = {
    version: 1,
    overall: 'passed',
    steps: {
      lint: { status: 'passed' },
      unit: { status: 'passed' },
      integration: { status: 'passed' },
      e2e: { status: 'passed' },
      review: { status: 'passed' },
      build: { status: 'passed' },
    },
    e2e: {
      frameworks: ['playwright'],
      realE2EPassedCount: 1,
      cases: [
        {
          id: 'core_happy_path',
          type: 'real_e2e',
          status: 'passed',
          platforms: ['web'],
        }
      ]
    },
    verification: {
      tier: 'LIGHT',
      reason: '改动范围较小且测试覆盖完整',
      filesChanged: 3,
      estimatedLinesChanged: 80,
      evidenceRequired: '结构化诊断结果干净 + 关键测试通过',
    }
  };

  const testContract = {
    version: 1,
    implementationType: 'web',
    deliveryTargets: ['web'],
    e2e: {
      frameworks: ['playwright'],
      minimumRealE2ECount: 1,
      requiredRealE2EScenarios: ['core_happy_path'],
    }
  };

  const previewDeploy = {
    version: 1,
    status: 'ready_for_uat',
    generatedAt: '2026-04-20T10:30:00.000Z',
    targets: [
      {
        type: 'backend',
        environment: 'staging',
        url: 'https://staging.example.test',
        status: 'deployed',
      }
    ]
  };

  ensureFile(workspace, '.workflow/test-contract.json', JSON.stringify({
    ...testContract,
    ...(overrides.testContract || {}),
    e2e: {
      ...testContract.e2e,
      ...((overrides.testContract && overrides.testContract.e2e) || {}),
    }
  }, null, 2) + '\n');

  ensureFile(workspace, 'docs/test-report.json', JSON.stringify({
    ...reportJson,
    ...(overrides.reportJson || {}),
    steps: {
      ...reportJson.steps,
      ...((overrides.reportJson && overrides.reportJson.steps) || {}),
    },
    e2e: {
      ...reportJson.e2e,
      ...((overrides.reportJson && overrides.reportJson.e2e) || {}),
    }
  }, null, 2) + '\n');

  ensureFile(workspace, '.workflow/preview-deploy.json', JSON.stringify({
    ...previewDeploy,
    ...(overrides.previewDeploy || {}),
    targets: Array.isArray(overrides.previewDeploy && overrides.previewDeploy.targets)
      ? overrides.previewDeploy.targets
      : previewDeploy.targets,
  }, null, 2) + '\n');
}

function passStage(workspace, stageName, files, summary) {
  files.forEach(file => ensureFile(workspace, file.path, file.content));
  const ready = runGate(workspace, ['ready', '--summary', summary, ...(stageName === 'development' ? ['--checks', 'lint,test,review,build'] : [])]);
  assert.equal(ready.status, 0, ready.stderr);
  const confirm = runGate(workspace, ['confirm']);
  assert.equal(confirm.status, 0, confirm.stderr);
}

test('reject 会停留在当前阶段并记录反馈，confirm 才会推进阶段', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);
  ensureFile(workspace, 'docs/requirement.md', buildRequirementDoc());

  const ready = runGate(workspace, ['ready', '--summary', '需求完成']);
  assert.equal(ready.status, 0, ready.stderr);

  const reject = runGate(workspace, ['reject', '补充异常流程']);
  assert.equal(reject.status, 0, reject.stderr);

  let state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'requirements_analysis');
  assert.equal(state.awaitingApproval, false);
  assert.equal(state.pendingFeedback, '补充异常流程');

  const readyAgain = runGate(workspace, ['ready', '--summary', '需求修订完成']);
  assert.equal(readyAgain.status, 0, readyAgain.stderr);

  const confirm = runGate(workspace, ['confirm']);
  assert.equal(confirm.status, 0, confirm.stderr);

  state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'prototype');
});

test('development 阶段缺少有效测试报告时 ready 应失败，补齐后可推进到 delivery', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);

  passStage(workspace, 'requirements_analysis', [
    { path: 'docs/requirement.md', content: buildRequirementDoc() }
  ], '需求完成');

  passStage(workspace, 'prototype', [
    { path: 'docs/prototype.md', content: buildPrototypeDoc() },
    { path: 'prototype/index.html', content: buildPrototypeHtml() }
  ], '原型完成');

  ensureFile(workspace, 'docs/test-report.md', '# 非法报告\n');
  let result = runGate(workspace, ['ready', '--summary', '开发完成', '--checks', 'lint,test,review,build']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /测试报告未显示最终结论为通过|不是有效的测试报告|当前阶段缺少必要文件：\.workflow\/test-contract\.json, \.workflow\/preview-deploy\.json, docs\/test-report\.json, docs\/code-review\.md/);

  ensureFile(workspace, 'docs/test-report.md', buildTestReportMarkdown());
  ensureFile(workspace, 'docs/code-review.md', buildCodeReviewDoc());
  createValidDevelopmentEvidence(workspace);

  ensureFile(workspace, 'src/web/README.md', 'web');
  ensureFile(workspace, 'src/backend/README.md', 'backend');
  ensureFile(workspace, 'src/app/android/README.md', 'android');
  ensureFile(workspace, 'src/app/ios/README.md', 'ios');
  ensureFile(workspace, 'src/web/tests/README.md', 'tests');
  ensureFile(workspace, 'src/backend/tests/README.md', 'tests');

  result = runGate(workspace, ['ready', '--summary', '开发完成', '--checks', 'lint,test,review,build']);
  assert.equal(result.status, 0, result.stderr);

  result = runGate(workspace, ['confirm']);
  assert.equal(result.status, 0, result.stderr);

  let state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'delivery');

  ensureFile(workspace, 'docs/delivery.md', buildDeliveryDoc());
  result = runGate(workspace, ['ready', '--summary', '交付完成']);
  assert.equal(result.status, 0, result.stderr);
  result = runGate(workspace, ['confirm']);
  assert.equal(result.status, 0, result.stderr);

  state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'done');

  const audit = fs.readFileSync(path.join(workspace, '.workflow/audit.log'), 'utf8');
  assert.match(audit, /READY: delivery 请求确认/);
  assert.match(audit, /CONFIRM: delivery -> done/);
});

test('development 阶段必须同时具备单元、集成和 E2E 测试报告记录', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);

  passStage(workspace, 'requirements_analysis', [
    { path: 'docs/requirement.md', content: buildRequirementDoc() }
  ], '需求完成');

  passStage(workspace, 'prototype', [
    { path: 'docs/prototype.md', content: buildPrototypeDoc() },
    { path: 'prototype/index.html', content: buildPrototypeHtml() }
  ], '原型完成');

  ensureFile(workspace, 'docs/test-report.md', buildTestReportMarkdown());
  ensureFile(workspace, 'docs/code-review.md', buildCodeReviewDoc());
  createValidDevelopmentEvidence(workspace, {
    reportJson: {
      steps: {
        integration: { status: 'failed' },
        e2e: { status: 'failed' },
      },
      e2e: {
        realE2EPassedCount: 0,
        cases: [],
      }
    }
  });

  const result = runGate(workspace, ['ready', '--summary', '开发完成', '--checks', 'lint,test,review,build']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /测试报告缺少必要测试通过记录：集成测试、E2E 测试|真实 E2E 通过数不足|结构化测试结果中没有通过的真实 E2E 用例/);
});

test('development 阶段缺少可验收预览部署证据时 ready 应失败', () => {
  const workspace = createWorkspace();
  runGate(workspace, ['init', '模板测试项目']);

  passStage(workspace, 'requirements_analysis', [
    { path: 'docs/requirement.md', content: buildRequirementDoc() }
  ], '需求完成');

  passStage(workspace, 'prototype', [
    { path: 'docs/prototype.md', content: buildPrototypeDoc() },
    { path: 'prototype/index.html', content: buildPrototypeHtml() }
  ], '原型完成');

  ensureFile(workspace, 'docs/test-report.md', buildTestReportMarkdown());
  ensureFile(workspace, 'docs/code-review.md', buildCodeReviewDoc());
  createValidDevelopmentEvidence(workspace, {
    previewDeploy: {
      status: 'pending',
      generatedAt: 'not-a-date',
      targets: [],
    }
  });

  const result = runGate(workspace, ['ready', '--summary', '开发完成待用户测试', '--checks', 'lint,test,review,build']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /preview-deploy\.status 必须是 ready_for_uat 或 deployed|preview-deploy\.generatedAt 必须是有效时间|preview-deploy\.targets 至少需要 1 个可验收目标/);
});

test('需求分析阶段未 confirm 前禁止写 prototype，confirm 后才允许进入原型阶段', () => {
  const workspace = createWorkspace('workflow-kit-calculator-scenario-');
  let result = runGate(workspace, ['init', 'GlassCalc']);
  assert.equal(result.status, 0, result.stderr);

  ensureFile(workspace, 'docs/requirement.md', [
    '# 计算器 — 需求规格说明书',
    '',
    '## 项目概述',
    '',
    '- 项目名称：GlassCalc',
    '- 项目类型：Web 单页应用',
    '',
    '## 功能需求',
    '',
    '- 核心功能：加减乘除，即时运算',
    '',
    '## 用户使用场景',
    '',
    '- 用户输入数字并点击运算符',
    '',
    '## 验收范围',
    '',
    '- 支持四则运算',
    '',
    '## 非目标',
    '',
    '- 暂不支持科学计算',
    '',
    '## 需求澄清',
    '',
    '- 视觉风格：玻璃拟态'
  ].join('\n'));

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: 'prototype/index.html'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /阶段 1：需求分析 不允许写入 prototype\/index\.html/);

  result = runGate(workspace, ['ready', '--summary', '已完成需求分析，确认四则运算计算器：移动端键盘布局、加减乘除、即时运算、玻璃拟态风格']);
  assert.equal(result.status, 0, result.stderr);

  let state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'requirements_analysis');
  assert.equal(state.awaitingApproval, true);

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: 'prototype/index.html'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /阶段 1：需求分析 不允许写入 prototype\/index\.html/);

  result = runGate(workspace, ['confirm']);
  assert.equal(result.status, 0, result.stderr);

  state = readJson(workspace, '.workflow/state.json');
  assert.equal(state.currentStage, 'prototype');
  assert.equal(state.awaitingApproval, false);

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: 'prototype/index.html'
    }
  });
  assert.equal(result.status, 0, result.stderr);
});

test('development 阶段默认禁止修改门控核心文件，但允许写测试契约与 E2E 产物', () => {
  const workspace = createWorkspace('workflow-kit-guard-core-files-');
  let result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  passStage(workspace, 'requirements_analysis', [
    { path: 'docs/requirement.md', content: buildRequirementDoc() }
  ], '需求完成');

  passStage(workspace, 'prototype', [
    { path: 'docs/prototype.md', content: buildPrototypeDoc() },
    { path: 'prototype/index.html', content: buildPrototypeHtml() }
  ], '原型完成');

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: 'scripts/workflow/config.js'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /阶段 3：开发与测试 不允许写入 scripts\/workflow\/config\.js/);

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: '.workflow/deliverables.json'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /阶段 3：开发与测试 不允许写入 \.workflow\/deliverables\.json/);

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: '.workflow/test-contract.json'
    }
  });
  assert.equal(result.status, 0, result.stderr);

  result = runStageGuard(workspace, {
    tool_name: 'Write',
    tool_input: {
      file_path: '.workflow/e2e-report.json'
    }
  });
  assert.equal(result.status, 0, result.stderr);
});

test('development 阶段禁止通过 Bash 绕过可写路径限制修改门控核心文件', () => {
  const workspace = createWorkspace('workflow-kit-guard-bash-write-');
  let result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  passStage(workspace, 'requirements_analysis', [
    { path: 'docs/requirement.md', content: buildRequirementDoc() }
  ], '需求完成');

  passStage(workspace, 'prototype', [
    { path: 'docs/prototype.md', content: buildPrototypeDoc() },
    { path: 'prototype/index.html', content: buildPrototypeHtml() }
  ], '原型完成');

  result = runStageGuard(workspace, {
    tool_name: 'Bash',
    tool_input: {
      command: 'printf "patched" > scripts/workflow/config.js'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不允许通过 Bash 写入 scripts\/workflow\/config\.js/);

  result = runStageGuard(workspace, {
    tool_name: 'Bash',
    tool_input: {
      command: 'printf "{\\"ok\\":true}\\n" > .workflow/test-contract.json'
    }
  });
  assert.equal(result.status, 0, result.stderr);
});

test('note 会写入阶段记忆文件，verify-tier 会生成结构化验证报告', () => {
  const workspace = createWorkspace();
  let result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  result = runGate(workspace, ['note', 'decision', '确定采用默认阶段门控模板']);
  assert.equal(result.status, 0, result.stderr);

  const decisions = fs.readFileSync(path.join(workspace, '.workflow', 'decisions.md'), 'utf8');
  assert.match(decisions, /确定采用默认阶段门控模板/);

  result = runGate(workspace, ['verify-tier']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /验证等级结果/);

  const verification = readJson(workspace, '.workflow/verification-report.json');
  assert.equal(typeof verification.tier, 'string');
  assert.equal(typeof verification.evidenceRequired, 'string');
});

test('项目在子目录中触发 Stop hook 时仍能向上定位模板脚本', () => {
  const workspace = createWorkspace('workflow-kit-hook-subdir-');
  let result = runGate(workspace, ['init', '模板测试项目']);
  assert.equal(result.status, 0, result.stderr);

  ensureFile(workspace, 'docs/requirement.md', buildRequirementDoc());
  result = runGate(workspace, ['ready', '--summary', '需求完成']);
  assert.equal(result.status, 0, result.stderr);

  const nestedDir = path.join(workspace, 'src', 'backend');
  fs.mkdirSync(nestedDir, { recursive: true });

  result = runConfiguredHook(workspace, 'Stop', nestedDir);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
  assert.match(result.stderr, /等待确认|阶段可申请确认|当前阶段尚未完成/);
});
