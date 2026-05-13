'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  createWorkspace,
  runNode,
  writePackageJson,
} = require('../../shared/helpers');

test('模板自带 test:all 可以在接入项目里生成通过的测试报告', () => {
  const workspace = createWorkspace('workflow-kit-run-all-tests-');
  writePackageJson(workspace, {
    name: 'template-consumer-fixture',
    private: true,
    scripts: {
      lint: 'node -e "console.log(\'lint ok\')"',
      'test:unit': 'node -e "console.log(\'unit ok\')"',
      'test:integration': 'node -e "console.log(\'integration ok\')"',
      'test:e2e': 'node -e "console.log(\'e2e ok\')"',
      build: 'node -e "console.log(\'build ok\')"',
      'review:code': 'node scripts/run-code-review.js'
    }
  });

  const result = runNode(workspace, ['scripts/run-all-tests.js']);
  assert.equal(result.status, 0, result.stderr);

  const reportPath = path.join(workspace, 'docs/test-report.md');
  assert.equal(fs.existsSync(reportPath), true);

  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /# 测试报告/);
  assert.match(report, /## 验证等级/);
  assert.match(report, /### 1\. 静态检查/);
  assert.match(report, /### 2\. 单元测试/);
  assert.match(report, /### 3\. 集成测试/);
  assert.match(report, /### 4\. E2E 测试/);
  assert.match(report, /### 5\. 代码审核/);
  assert.match(report, /### 6\. 构建检查/);
  assert.match(report, /- 最终结论：通过/);

  const codeReviewReport = fs.readFileSync(path.join(workspace, 'docs/code-review.md'), 'utf8');
  assert.match(codeReviewReport, /# 代码审核报告/);
  assert.match(codeReviewReport, /- 审核结论：通过/);

  const structuredReport = JSON.parse(fs.readFileSync(path.join(workspace, 'docs/test-report.json'), 'utf8'));
  assert.equal(typeof structuredReport.verification.tier, 'string');
});
