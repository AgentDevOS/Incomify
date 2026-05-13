#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const REQUIRED_FILES = [
  'AGENTS.md',
  'package.json',
  'scripts/package.json',
  'scripts/run-all-tests.js',
  'scripts/verify-prototype.js',
  'scripts/test-verify-prototype.js',
  'scripts/test-workflow-config.js',
  'scripts/test-sync-backend-api-paths.js',
  'scripts/workflow/gate.js',
  'scripts/workflow/config.js',
  'scripts/workflow/state.js',
  'scripts/workflow/doctor.js',
  'scripts/workflow/sync-backend-api-paths.js',
  'skills/stage-gated-delivery/SKILL.md',
  '.workflow/state.example.json',
  '.workflow/test-contract.example.json',
  '.workflow/backend-contract.example.json',
  '.workflow/e2e-report.example.json',
  '.workflow/api-report.example.json',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(PROJECT_ROOT, relativePath));
}

function collectRequiredFileChecks() {
  const missingFiles = REQUIRED_FILES.filter(relativePath => !fileExists(relativePath));
  if (missingFiles.length === 0) {
    return [{
      level: 'pass',
      label: '模板文件',
      detail: 'Codex workflow 必需文件齐全',
    }];
  }

  return missingFiles.map(relativePath => ({
    level: 'fail',
    label: '模板文件',
    detail: `缺少 ${relativePath}`,
  }));
}

function collectPackageChecks() {
  const packageJsonPath = path.resolve(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [{
      level: 'fail',
      label: 'package.json',
      detail: '缺少 package.json',
    }];
  }

  try {
    const packageJson = readJson(packageJsonPath);
    const scripts = packageJson.scripts || {};
    const checks = [];

    for (const scriptName of ['verify:prototype', 'test:all', 'review:code']) {
      checks.push({
        level: scripts[scriptName] ? 'pass' : 'warn',
        label: `npm script ${scriptName}`,
        detail: scripts[scriptName]
          ? scripts[scriptName]
          : `建议补充 ${scriptName}，用于阶段验证`,
      });
    }

    if (packageJson.type === 'module' && !fileExists('scripts/package.json')) {
      checks.push({
        level: 'warn',
        label: 'ESM 兼容层',
        detail: '项目 package.json 使用了 "type":"module"，但缺少 scripts/package.json。workflow 脚本可能因 require() 报错。',
      });
    } else if (packageJson.type === 'module') {
      checks.push({
        level: 'pass',
        label: 'ESM 兼容层',
        detail: '检测到 "type":"module" 且 scripts/package.json 已存在，workflow 脚本可按 CommonJS 运行。',
      });
    }

    return checks;
  } catch (error) {
    return [{
      level: 'fail',
      label: 'package.json',
      detail: `解析失败：${error.message}`,
    }];
  }
}

function collectWorkflowStateChecks() {
  const workflowStatePath = path.resolve(PROJECT_ROOT, '.workflow/state.json');
  if (!fs.existsSync(workflowStatePath)) {
    return [{
      level: 'warn',
      label: '工作流状态',
      detail: '缺少 .workflow/state.json，需先执行 node scripts/workflow/gate.js init "项目名称"',
    }];
  }

  try {
    const state = readJson(workflowStatePath);
    return [{
      level: 'pass',
      label: '当前阶段',
      detail: `${state.currentStage}${state.awaitingApproval ? '（等待确认）' : ''}`,
    }];
  } catch (error) {
    return [{
      level: 'fail',
      label: '状态文件',
      detail: `.workflow/state.json 解析失败：${error.message}`,
    }];
  }
}

function collectChecks() {
  const checks = [
    ...collectRequiredFileChecks(),
    ...collectPackageChecks(),
    ...collectWorkflowStateChecks(),
  ];

  checks.push({
    level: process.versions.node ? 'pass' : 'fail',
    label: 'Node.js',
    detail: process.versions.node ? `当前版本 ${process.versions.node}` : '无法读取 Node.js 版本',
  });

  checks.push({
    level: fileExists('.git') ? 'pass' : 'warn',
    label: 'Git 仓库',
    detail: fileExists('.git')
      ? '当前目录包含 .git'
      : '当前目录不是 git 仓库。真实项目建议在仓库根目录安装并测试工作流。',
  });

  return checks;
}

function printChecks(checks) {
  const icon = {
    pass: 'PASS',
    warn: 'WARN',
    fail: 'FAIL',
  };

  console.log('Stage-Gated Workflow Doctor');
  console.log(`项目目录：${PROJECT_ROOT}`);
  console.log('');

  for (const check of checks) {
    console.log(`[${icon[check.level]}] ${check.label}: ${check.detail}`);
  }

  console.log('');
  console.log('建议：');
  console.log('- 先修复所有 FAIL 项');
  console.log('- 阶段完成前运行 gate.js、verify:prototype、test:all 等脚本获取真实门控结果');
  console.log('- Codex 侧遵循 AGENTS.md；硬门控应接入脚本、CI、git hook 或外层 runner');
}

function main() {
  const checks = collectChecks();
  printChecks(checks);

  if (checks.some(check => check.level === 'fail')) {
    process.exit(1);
  }
}

main();
