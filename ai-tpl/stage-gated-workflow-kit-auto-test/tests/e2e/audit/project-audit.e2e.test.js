'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  TEMPLATE_ROOT,
  createWorkspace,
  ensureFile,
  getProjectStructureFindings,
  getSuspiciousTestScriptFindings,
  readText,
  writePackageJson,
} = require('../../shared/helpers');

function createNonCompliantProjectFixture() {
  const projectRoot = createWorkspace('workflow-kit-audit-fixture-');
  ensureFile(projectRoot, 'README.md', '# audit fixture\n');
  writePackageJson(projectRoot, {
    name: 'audit-fixture',
    private: true,
    scripts: {
      test: 'node -e "console.log(\'No real tests required\')"',
      'test:unit': 'node -e "console.log(\'No unit tests required\')"',
      'test:integration': 'node -e "console.log(\'No integration tests required\')"',
      'test:e2e': 'node -e "const fs=require(\'fs\'); console.log(fs.existsSync(\'prototype/index.html\') ? \'prototype/index.html exists\' : \'file not found\')"'
    }
  });

  ensureFile(projectRoot, 'prototype/index.html', '<!doctype html><title>Prototype</title>');
  ensureFile(projectRoot, 'prototype/game.js', 'export const legacyPrototype = true;\n');
  return projectRoot;
}

test('模板规则明确要求开发阶段保留结构化测试契约与平台目录约束', () => {
  const configText = readText(path.join(TEMPLATE_ROOT, 'scripts', 'workflow', 'config.js'));
  const sdkText = readText(path.join(TEMPLATE_ROOT, 'scripts', 'workflow', 'sdk-stage-test.mjs'));

  assert.match(configText, /'src\/'/);
  assert.match(configText, /'integration_test\/'/);
  assert.match(configText, /'patrol\/'/);
  assert.doesNotMatch(configText, /'tests\/'/);
  assert.doesNotMatch(configText, /'e2e\/'/);
  assert.doesNotMatch(configText, /'ios\/'/);
  assert.doesNotMatch(configText, /'android\/'/);
  assert.doesNotMatch(configText, /'miniprogram\/'/);
  assert.match(configText, /test-contract\.json/);
  assert.match(sdkText, /'docs\/test-report\.md'/);
  assert.match(sdkText, /docs\/test-report\.json/);
  assert.match(sdkText, /test-contract\.json/);
  assert.match(sdkText, /Playwright/);
  assert.match(sdkText, /Patrol/);
  assert.match(sdkText, /Detox/);
  assert.match(sdkText, /src\/app\/ios/);
  assert.match(sdkText, /src\/app\/android/);
  assert.match(sdkText, /src\/miniprogram/);
  assert.match(sdkText, /src\/backend/);
});

test('不合规接入项目会被结构审计识别出未迁移到 src 的问题', () => {
  const fixtureRoot = createNonCompliantProjectFixture();
  const findings = getProjectStructureFindings(fixtureRoot);

  assert.ok(findings.some(item => item.includes('正式实现仍停留在 prototype/')));
  assert.ok(findings.some(item => item.includes('缺少开发阶段约定目录')));
});

test('小程序项目会要求正式前端实现进入 src/miniprogram', () => {
  const fixtureRoot = createWorkspace('workflow-kit-miniprogram-audit-fixture-');
  ensureFile(fixtureRoot, 'docs/requirement.md', '# 需求文档\n\n目标项目是一个微信小程序。\n');
  ensureFile(fixtureRoot, 'prototype/index.html', '<!doctype html><title>Prototype</title>');
  ensureFile(fixtureRoot, 'src/web/app.js', 'console.log("wrong place");\n');

  const findings = getProjectStructureFindings(fixtureRoot);

  assert.ok(findings.some(item => item.includes('src/miniprogram')));
  assert.ok(findings.some(item => item.includes('项目目标是小程序')));
});

test('不合规接入项目会被测试脚本审计识别出伪测试问题', () => {
  const fixtureRoot = createNonCompliantProjectFixture();
  const findings = getSuspiciousTestScriptFindings(fixtureRoot);

  assert.ok(findings.some(item => item.includes('占位文案')));
  assert.ok(findings.some(item => item.includes('仅检查文件存在')));
});

test('自动化测试工作区会落在仓库内固定产物目录', () => {
  const workspace = createWorkspace('workflow-kit-visible-artifact-');

  assert.match(workspace, /stage-gated-workflow-kit-auto-test\/\.artifacts\/workspaces\//);
  assert.equal(fs.existsSync(path.join(workspace, 'scripts', 'run-all-tests.js')), true);
});
