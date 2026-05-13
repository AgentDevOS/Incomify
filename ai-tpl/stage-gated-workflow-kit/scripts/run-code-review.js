#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const REPORT_PATH = path.join(DOCS_DIR, 'code-review.md');
const SCAN_DIRS = ['src', 'tests'];
const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.html',
  '.css',
]);

function listFiles(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  return entries.flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      return [];
    }
    return listFiles(path.join(targetPath, entry.name));
  });
}

function getScanFiles() {
  return SCAN_DIRS
    .flatMap(dir => listFiles(path.join(ROOT, dir)))
    .filter(filePath => TEXT_FILE_EXTENSIONS.has(path.extname(filePath)));
}

function addFinding(findings, severity, filePath, line, issue, fix) {
  findings.push({
    severity,
    filePath: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    line,
    issue,
    fix,
  });
}

function scanFile(filePath, findings) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    const line = index + 1;

    if (/console\.log\s*\(/.test(lineText)) {
      addFinding(findings, 'HIGH', filePath, line, '存在 console.log 调试语句', '提交前移除调试输出，改为测试断言或正式日志方案。');
    }

    if (/\b(?:TODO|FIXME)\b/.test(lineText)) {
      addFinding(findings, 'MEDIUM', filePath, line, '存在未闭环的 TODO/FIXME 标记', '补充任务单号，或在交付前完成该项实现。');
    }

    if (/sk-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/.test(lineText)) {
      addFinding(findings, 'CRITICAL', filePath, line, '疑似硬编码密钥或私钥内容', '改为环境变量或密钥管理方案，并避免写入仓库。');
    }
  });

  if (lines.length > 800) {
    addFinding(findings, 'HIGH', filePath, 1, '文件长度超过 800 行', '按职责拆分文件，降低耦合和审查成本。');
  }
}

function buildSummary(findings) {
  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  findings.forEach(item => {
    counts[item.severity] += 1;
  });

  const verdict = counts.CRITICAL > 0
    ? '阻断'
    : counts.HIGH > 0
      ? '警告'
      : '通过';

  return { counts, verdict };
}

function renderFindings(title, severity, findings, lines) {
  lines.push(`## ${title}`);
  lines.push('');

  const scoped = findings.filter(item => item.severity === severity);
  if (scoped.length === 0) {
    lines.push('无');
    lines.push('');
    return;
  }

  scoped.forEach(item => {
    lines.push(`- 文件：\`${item.filePath}:${item.line}\``);
    lines.push(`- 问题：${item.issue}`);
    lines.push(`- 建议：${item.fix}`);
    lines.push('');
  });
}

function buildReport(files, findings) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const { counts, verdict } = buildSummary(findings);

  const lines = [
    '# 代码审核报告',
    '',
    '## 概览',
    '',
    `- 生成时间：${generatedAt}`,
    `- 项目路径：\`${ROOT}\``,
    `- 扫描范围：${SCAN_DIRS.join('、')}`,
    `- 已扫描文件数：${files.length}`,
    `- 审核结论：${verdict === '通过' ? '通过' : verdict}`,
    '',
    '## 审核标准',
    '',
    '- 参考本地代码审核思路，优先检查安全、质量和可维护性。',
    '- 当前模板内建检查项包括：硬编码密钥、console.log、TODO/FIXME、超长文件。',
    '- 如需更严格规则，可在项目内扩展该脚本或补充人工审查结论。',
    '',
    '## 审核摘要',
    '',
    '| 严重级别 | 数量 |',
    '| --- | --- |',
    `| CRITICAL | ${counts.CRITICAL} |`,
    `| HIGH | ${counts.HIGH} |`,
    `| MEDIUM | ${counts.MEDIUM} |`,
    `| LOW | ${counts.LOW} |`,
    '',
  ];

  renderFindings('CRITICAL', 'CRITICAL', findings, lines);
  renderFindings('HIGH', 'HIGH', findings, lines);
  renderFindings('MEDIUM', 'MEDIUM', findings, lines);
  renderFindings('LOW', 'LOW', findings, lines);

  return { report: lines.join('\n'), verdict };
}

function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const files = getScanFiles();
  const findings = [];

  files.forEach(filePath => scanFile(filePath, findings));

  const { report, verdict } = buildReport(files, findings);
  fs.writeFileSync(REPORT_PATH, report + '\n', 'utf8');
  console.log(`代码审核报告已写入：${REPORT_PATH}`);

  if (verdict !== '通过') {
    console.error(`代码审核未通过，当前结论：${verdict}`);
    process.exit(1);
  }

  console.log('代码审核通过');
}

main();
