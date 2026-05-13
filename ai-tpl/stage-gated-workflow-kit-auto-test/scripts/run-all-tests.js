#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const REPORT_PATH = path.join(DOCS_DIR, 'test-report.md');

const STEPS = [
  {
    label: '静态检查',
    command: 'npm run lint',
    script: ['run', 'lint'],
    scope: '确认测试工程本身可执行基础检查脚本'
  },
  {
    label: '单元测试',
    command: 'npm run test:unit',
    script: ['run', 'test:unit'],
    scope: '验证模板初始化、必要文件约束和基础状态机行为'
  },
  {
    label: '集成测试',
    command: 'npm run test:integration',
    script: ['run', 'test:integration'],
    scope: '验证完整阶段推进、拒绝回退和开发阶段测试凭证校验'
  },
  {
    label: 'E2E 测试',
    command: 'npm run test:e2e',
    script: ['run', 'test:e2e'],
    scope: '验证模板自带测试链路在接入项目中的报告生成行为，并审计动态生成的不合规项目'
  },
  {
    label: '构建检查',
    command: 'npm run build',
    script: ['run', 'build'],
    scope: '确认当前测试工程无需额外构建步骤'
  }
];

function runStep(step) {
  const result = spawnSync('npm', step.script, {
    cwd: ROOT,
    encoding: 'utf8'
  });

  const output = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
  return {
    ...step,
    code: result.status ?? 1,
    status: result.status === 0 ? '通过' : '失败',
    output
  };
}

function buildReport(results) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const overall = results.every(item => item.code === 0) ? '通过' : '失败';
  const lines = [
    '# 测试报告',
    '',
    '## 概览',
    '',
    `- 生成时间：${generatedAt}`,
    `- 项目路径：\`${ROOT}\``,
    '- 测试策略：静态检查 -> 单元测试 -> 集成测试 -> E2E 测试 -> 构建检查',
    '- 当前默认链路先覆盖模板规则、状态流转、接入项目审计与 run-all-tests 行为；Claude Code SDK 真实业务场景回归暂未接入默认 test:all。',
    `- 最终结论：${overall}`,
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

  return lines.join('\n');
}

function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const results = [];
  for (const step of STEPS) {
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

  fs.writeFileSync(REPORT_PATH, buildReport(results), 'utf8');
  console.log(`测试报告已写入：${REPORT_PATH}`);

  const failed = results.find(item => item.code !== 0);
  if (failed) {
    console.error(`完整测试链路失败，失败阶段：${failed.label}`);
    process.exit(1);
  }
}

main();
