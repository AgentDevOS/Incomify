'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getInvalidCheckEvidence } = require('./workflow/config');

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, JSON.stringify(value, null, 2) + '\n');
}

function withTempProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-config-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function validMarkdownReport() {
  return [
    '# 测试报告',
    '',
    '- 最终结论：通过',
    '',
    '## 验证等级',
    '',
    '- 验证等级：STANDARD',
    '',
    '## 结果明细',
    '',
    '### 1. 静态检查',
    '',
    '- 执行结果：通过',
    '',
    '### 2. 单元测试',
    '',
    '- 执行结果：通过',
    '',
    '### 3. 集成测试',
    '',
    '- 执行结果：通过',
    '',
    '### 4. E2E 测试',
    '',
    '- 执行结果：通过',
    '',
    '### 5. 代码审核',
    '',
    '- 执行结果：通过',
    '',
    '### 6. 构建检查',
    '',
    '- 执行结果：通过',
    '',
  ].join('\n');
}

function validCodeReview() {
  return [
    '# 代码审核报告',
    '',
    '## 概览',
    '',
    '- 审核结论：通过',
    '',
    '## 审核标准',
    '',
    '- 安全',
    '',
    '## 审核摘要',
    '',
    '- 未发现阻塞问题',
    '',
  ].join('\n');
}

function validContract() {
  return {
    version: 1,
    implementationType: 'web',
    deliveryTargets: ['web'],
    e2e: {
      frameworks: ['playwright'],
      minimumRealE2ECount: 1,
      requiredRealE2EScenarios: ['core_happy_path'],
    },
    backend: {
      language: 'rust',
      framework: 'axum',
      database: 'sqlite',
      apiPaths: [
        { method: 'POST', path: '/api/login' },
        { method: 'GET', path: '/api/todos' },
      ],
    },
  };
}

function validStructuredReport(apiCases) {
  return {
    version: 1,
    overall: 'passed',
    steps: {
      unit: { status: 'passed' },
      integration: { status: 'passed' },
      e2e: { status: 'passed' },
    },
    verification: {
      tier: 'STANDARD',
      evidenceRequired: '结构化测试结果 + 构建通过',
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
        },
      ],
    },
    api: {
      cases: apiCases,
    },
  };
}

function validPreviewDeploy() {
  return {
    status: 'ready_for_uat',
    generatedAt: '2026-04-29T00:00:00.000Z',
    targets: [
      {
        type: 'web',
        status: 'built',
        artifact: 'src/web/index.html',
      },
    ],
  };
}

function writeDevelopmentEvidence(root, apiCases) {
  writeFile(root, 'docs/test-report.md', validMarkdownReport());
  writeFile(root, 'docs/code-review.md', validCodeReview());
  writeJson(root, 'docs/test-report.json', validStructuredReport(apiCases));
  writeJson(root, '.workflow/test-contract.json', validContract());
  writeJson(root, '.workflow/preview-deploy.json', validPreviewDeploy());
}

const developmentState = { currentStage: 'development' };
const allChecks = ['lint', 'test', 'review', 'build'];

withTempProject(root => {
  writeDevelopmentEvidence(root, [
    {
      method: 'POST',
      path: '/api/login',
      status: 'passed',
      testFile: 'src/backend/tests/api/login.rs',
    },
  ]);

  const issues = getInvalidCheckEvidence(developmentState, allChecks, root);

  assert(
    issues.some(issue => issue.includes('后端 API GET /api/todos 缺少通过的 API 测试记录')),
    `expected missing API coverage issue, got: ${issues.join('；')}`
  );
});

withTempProject(root => {
  writeDevelopmentEvidence(root, [
    {
      method: 'POST',
      path: '/api/login',
      status: 'passed',
      testFile: 'src/backend/tests/api/login.rs',
    },
    {
      method: 'GET',
      path: '/api/todos',
      status: 'passed',
      testFile: 'src/backend/tests/api/todos.rs',
    },
  ]);

  const issues = getInvalidCheckEvidence(developmentState, allChecks, root);

  assert.deepStrictEqual(issues, []);
});

console.log('workflow config tests passed');
