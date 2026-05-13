'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_ROOT = path.resolve(PROJECT_ROOT, '..', 'stage-gated-workflow-kit');
const ARTIFACTS_ROOT = path.join(PROJECT_ROOT, '.artifacts');
const WORKSPACES_ROOT = path.join(ARTIFACTS_ROOT, 'workspaces');

function sanitizePrefix(prefix) {
  return prefix.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function createArtifactWorkspace(prefix) {
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

  const workspaceName = `${sanitizePrefix(prefix)}${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const workspace = path.join(WORKSPACES_ROOT, workspaceName);
  fs.mkdirSync(workspace, { recursive: true });
  return workspace;
}

function createWorkspace(prefix = 'workflow-kit-test-') {
  const workspace = createArtifactWorkspace(prefix);
  fs.cpSync(TEMPLATE_ROOT, workspace, {
    recursive: true,
    filter: source => !source.includes('/node_modules/')
  });
  return workspace;
}

function ensureFile(workspace, relativePath, content = '') {
  const filePath = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function readJson(workspace, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspace, relativePath), 'utf8'));
}

function runNode(workspace, args, options = {}) {
  return spawnSync('node', args, {
    cwd: workspace,
    encoding: 'utf8',
    ...options
  });
}

function runGate(workspace, args, options = {}) {
  return runNode(workspace, ['scripts/workflow/gate.js', ...args], options);
}

function runStageGuard(workspace, event, options = {}) {
  return spawnSync('node', ['scripts/hooks/workflow-stage-guard.js'], {
    cwd: workspace,
    encoding: 'utf8',
    input: JSON.stringify(event),
    ...options
  });
}

function runConfiguredHook(workspace, hookEventName, cwd, input = '', options = {}) {
  const settings = readJson(workspace, '.claude/settings.json');
  const hookEntries = settings.hooks && settings.hooks[hookEventName];
  if (!Array.isArray(hookEntries) || hookEntries.length === 0) {
    throw new Error(`未找到 ${hookEventName} hook 配置`);
  }

  const command = hookEntries[0].hooks && hookEntries[0].hooks[0] && hookEntries[0].hooks[0].command;
  if (!command) {
    throw new Error(`${hookEventName} hook 缺少 command`);
  }

  return spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    input,
    ...options
  });
}

function writePackageJson(workspace, packageJson) {
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  );
}

function readText(targetPath) {
  return fs.readFileSync(targetPath, 'utf8');
}

function hasAnyFile(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return false;
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return entries.some(entry => {
    const fullPath = path.join(targetDir, entry.name);
    return entry.isFile() || hasAnyFile(fullPath);
  });
}

function detectProjectTargets(projectRoot) {
  const requirementPath = path.join(projectRoot, 'docs', 'requirement.md');
  const prototypePath = path.join(projectRoot, 'docs', 'prototype.md');
  const combinedText = [requirementPath, prototypePath]
    .filter(filePath => fs.existsSync(filePath))
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  return {
    isMiniProgram: /小程序|miniprogram/i.test(combinedText),
  };
}

function getProjectStructureFindings(projectRoot) {
  const targets = detectProjectTargets(projectRoot);
  const requiredPaths = [
    'src/app/android',
    'src/app/ios',
    'src/backend',
    'src/backend/tests',
  ];
  const frontendPath = targets.isMiniProgram ? 'src/miniprogram' : 'src/web';
  const frontendTestsPath = `${frontendPath}/tests`;
  requiredPaths.splice(2, 0, frontendPath);
  requiredPaths.splice(3, 0, frontendTestsPath);

  const missingPaths = requiredPaths.filter(relativePath => !fs.existsSync(path.join(projectRoot, relativePath)));
  const findings = [];

  if (missingPaths.length > 0) {
    findings.push(`缺少开发阶段约定目录：${missingPaths.join(', ')}`);
  }

  const prototypePath = path.join(projectRoot, 'prototype', 'index.html');
  const frontendDirPath = path.join(projectRoot, ...frontendPath.split('/'));
  if (fs.existsSync(prototypePath) && !hasAnyFile(frontendDirPath)) {
    findings.push(`正式实现仍停留在 prototype/，${frontendPath}/ 下没有可用源码`);
  }

  if (targets.isMiniProgram && hasAnyFile(path.join(projectRoot, 'src', 'web')) && !hasAnyFile(frontendDirPath)) {
    findings.push('项目目标是小程序，但正式前端实现没有放在 src/miniprogram/');
  }

  const forbiddenRootPaths = ['tests', 'e2e', 'ios', 'android', 'miniprogram'];
  const existingForbiddenRootPaths = forbiddenRootPaths.filter(relativePath => fs.existsSync(path.join(projectRoot, relativePath)));
  if (existingForbiddenRootPaths.length > 0) {
    findings.push(`正式代码或测试不应散落到项目根目录：${existingForbiddenRootPaths.join(', ')}`);
  }

  return findings;
}

function getSuspiciousTestScriptFindings(projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return ['缺少 package.json'];
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const scripts = packageJson.scripts || {};
  const findings = [];
  const watchList = ['test', 'test:unit', 'test:integration', 'test:e2e'];

  watchList.forEach(scriptName => {
    const command = scripts[scriptName];
    if (!command) {
      findings.push(`缺少脚本：${scriptName}`);
      return;
    }

    if (/No .* tests required/i.test(command)) {
      findings.push(`脚本 ${scriptName} 使用了占位文案，未执行真实测试`);
    }

    if (
      scriptName === 'test:e2e'
      && /(existsSync|file not found|prototype\/index\.html exists)/.test(command)
    ) {
      findings.push('test:e2e 仅检查文件存在，未覆盖真实交互或业务路径');
    }
  });

  return findings;
}

module.exports = {
  ARTIFACTS_ROOT,
  TEMPLATE_ROOT,
  createWorkspace,
  ensureFile,
  getProjectStructureFindings,
  getSuspiciousTestScriptFindings,
  readText,
  readJson,
  runGate,
  runConfiguredHook,
  runNode,
  runStageGuard,
  writePackageJson,
};
