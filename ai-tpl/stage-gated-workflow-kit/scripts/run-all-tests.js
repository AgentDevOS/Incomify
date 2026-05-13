#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeVerificationReport } = require('./workflow/verification');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const REPORT_PATH = path.join(DOCS_DIR, 'test-report.md');
const JSON_REPORT_PATH = path.join(DOCS_DIR, 'test-report.json');
const E2E_ARTIFACT_PATH = path.join(ROOT, '.workflow', 'e2e-report.json');
const API_ARTIFACT_PATH = path.join(ROOT, '.workflow', 'api-report.json');
const STATE_PATH = path.join(ROOT, '.workflow', 'state.json');

const OPTIONAL_STEPS = [
  {
    id: 'lint',
    label: '静态检查',
    command: 'npm run lint',
    script: ['run', 'lint'],
    scope: '检查当前项目是否配置并通过静态检查'
  },
  {
    id: 'unit',
    label: '单元测试',
    command: 'npm run test:unit',
    script: ['run', 'test:unit'],
    scope: '检查核心模块的单元测试'
  },
  {
    id: 'integration',
    label: '集成测试',
    command: 'npm run test:integration',
    script: ['run', 'test:integration'],
    scope: '检查模块之间的集成测试'
  },
  {
    id: 'e2e',
    label: 'E2E 测试',
    command: 'npm run test:e2e',
    script: ['run', 'test:e2e'],
    scope: '检查关键用户路径的端到端测试'
  },
  {
    id: 'review',
    label: '代码审核',
    command: 'npm run review:code',
    script: ['run', 'review:code'],
    scope: '检查代码中的安全、质量与可维护性风险'
  },
  {
    id: 'build',
    label: '构建检查',
    command: 'npm run build',
    script: ['run', 'build'],
    scope: '检查开发阶段的验证性构建是否通过，不等同于交付阶段 release 打包'
  }
];

const REQUIRED_STEP_IDS = new Set(['lint', 'unit', 'integration', 'e2e', 'review', 'build']);

function hasPackageScript(scriptName) {
  const packageJsonPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return Boolean(packageJson.scripts && packageJson.scripts[scriptName]);
}

function runStep(step) {
  const result = spawnSync('npm', step.script, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true
  });

  const output = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
  return {
    ...step,
    status: result.status === 0 ? '通过' : '失败',
    code: result.status ?? 1,
    output
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      _parseError: error.message,
      _path: filePath,
    };
  }
}

function resolveVerificationStage() {
  if (!fs.existsSync(STATE_PATH)) {
    return 'development';
  }

  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return state.currentStage || 'development';
  } catch {
    return 'development';
  }
}

function buildReport(results, skippedSteps, missingRequiredSteps = [], verification = null) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const overall = results.every(item => item.code === 0) && missingRequiredSteps.length === 0 ? '通过' : '失败';

  const lines = [
    '# 测试报告',
    '',
    '## 概览',
    '',
    `- 生成时间：${generatedAt}`,
    `- 项目路径：\`${ROOT}\``,
    `- 已执行步骤：${results.map(item => item.label).join(' -> ') || '无'}`,
    `- 已跳过步骤：${skippedSteps.map(item => item.label).join('、') || '无'}`,
    `- 缺少必要步骤：${missingRequiredSteps.map(item => item.label).join('、') || '无'}`,
    `- 最终结论：${overall}`,
    '',
    '## 说明',
    '',
    '- 本报告由 `scripts/run-all-tests.js` 自动生成。',
    '- 仅执行当前项目 `package.json` 中已定义的测试或构建脚本。',
    '- 未定义的脚本会被标记为跳过，不视为失败。',
    '',
    '## 验证等级',
    '',
    verification
      ? `- 验证等级：${verification.tier}`
      : '- 验证等级：未生成',
    verification
      ? `- 评估原因：${verification.reason}`
      : '- 评估原因：未生成',
    verification
      ? `- 改动文件数：${verification.filesChanged}`
      : '- 改动文件数：-',
    verification
      ? `- 估算改动行数：${verification.estimatedLinesChanged}`
      : '- 估算改动行数：-',
    verification
      ? `- 证据要求：${verification.evidenceRequired}`
      : '- 证据要求：-',
    verification && verification.warnings && verification.warnings.length > 0
      ? `- 警告：${verification.warnings.join('；')}`
      : '- 警告：无',
    '',
    '## 结果明细',
    ''
  ];

  results.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.label}`);
    lines.push('');
    lines.push(`- 执行命令：\`${item.command}\``);
    lines.push(`- 测试内容：${item.scope}`);
    lines.push(`- 执行结果：${item.status}`);
    lines.push('');
    lines.push('```text');
    lines.push(item.output || '无输出');
    lines.push('```');
    lines.push('');
  });

  if (skippedSteps.length > 0) {
    lines.push('## 已跳过步骤');
    lines.push('');
    skippedSteps.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.label}：未在 package.json 中定义对应脚本。`);
    });
    lines.push('');
  }

  if (missingRequiredSteps.length > 0) {
    lines.push('## 缺少必要步骤');
    lines.push('');
    missingRequiredSteps.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.label}：必须在 package.json 中定义 ${item.command} 并执行通过。`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function buildJsonReport(results, skippedSteps, missingRequiredSteps = [], verification = null) {
  const generatedAt = new Date().toISOString();
  const overall = results.every(item => item.code === 0) && missingRequiredSteps.length === 0 ? 'passed' : 'failed';
  const steps = {};

  results.forEach(item => {
    steps[item.id] = {
      label: item.label,
      command: item.command,
      scope: item.scope,
      status: item.code === 0 ? 'passed' : 'failed',
      exitCode: item.code,
      output: item.output || '',
    };
  });

  const e2eArtifact = readJsonIfExists(E2E_ARTIFACT_PATH);
  const apiArtifact = readJsonIfExists(API_ARTIFACT_PATH);

  return {
    version: 1,
    generatedAt,
    projectPath: ROOT,
    overall,
    steps,
    executedSteps: results.map(item => item.id),
    skippedSteps: skippedSteps.map(item => item.id),
    missingRequiredSteps: missingRequiredSteps.map(item => item.id),
    verification,
    e2e: e2eArtifact && !e2eArtifact._parseError
      ? (e2eArtifact.e2e || e2eArtifact)
      : null,
    api: apiArtifact && !apiArtifact._parseError
      ? (apiArtifact.api || apiArtifact)
      : null,
    warnings: [
      e2eArtifact && e2eArtifact._parseError
        ? `无法解析 ${e2eArtifact._path}：${e2eArtifact._parseError}`
        : '',
      apiArtifact && apiArtifact._parseError
        ? `无法解析 ${apiArtifact._path}：${apiArtifact._parseError}`
        : '',
    ].filter(Boolean),
  };
}

function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const results = [];
  const verification = writeVerificationReport(resolveVerificationStage(), ROOT);

  const runnableSteps = [];
  const skippedSteps = [];

  OPTIONAL_STEPS.forEach(step => {
    const scriptName = step.script[1];
    if (hasPackageScript(scriptName)) {
      runnableSteps.push(step);
      return;
    }
    skippedSteps.push(step);
  });

  if (runnableSteps.length === 0) {
    const missingRequiredSteps = skippedSteps.filter(step => REQUIRED_STEP_IDS.has(step.id));
    const report = buildReport([], skippedSteps, missingRequiredSteps, verification);
    fs.writeFileSync(REPORT_PATH, report, 'utf8');
    fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(buildJsonReport([], skippedSteps, missingRequiredSteps, verification), null, 2) + '\n', 'utf8');
    console.log(`测试报告已写入：${REPORT_PATH}`);
    console.error('未找到可执行的测试脚本，请先在 package.json 中定义 lint/test:unit/test:integration/test:e2e/review:code/build。');
    process.exit(1);
  }

  const missingRequiredSteps = skippedSteps.filter(step => REQUIRED_STEP_IDS.has(step.id));
  if (missingRequiredSteps.length > 0) {
    const report = buildReport(results, skippedSteps, missingRequiredSteps, verification);
    fs.writeFileSync(REPORT_PATH, report, 'utf8');
    fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(buildJsonReport(results, skippedSteps, missingRequiredSteps, verification), null, 2) + '\n', 'utf8');
    console.log(`测试报告已写入：${REPORT_PATH}`);
    console.error(`缺少必要测试链路脚本：${missingRequiredSteps.map(item => item.command).join('、')}`);
    process.exit(1);
  }

  for (const step of runnableSteps) {
    console.log('');
    console.log(`正在执行：${step.label}`);
    const result = runStep(step);
    if (result.output) {
      console.log(result.output);
    }
    results.push(result);
    if (result.code !== 0) {
      break;
    }
  }

  fs.writeFileSync(REPORT_PATH, buildReport(results, skippedSteps, missingRequiredSteps, verification), 'utf8');
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(buildJsonReport(results, skippedSteps, missingRequiredSteps, verification), null, 2) + '\n', 'utf8');
  console.log('');
  console.log(`测试报告已写入：${REPORT_PATH}`);

  const failed = results.find(item => item.code !== 0);
  if (failed) {
    console.error(`完整测试链路失败，失败阶段：${failed.label}`);
    process.exit(1);
  }

  console.log('完整测试链路执行完成');
}

main();
