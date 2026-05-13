#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_DOC_SECTIONS = ['## 页面清单', '## 关键交互', '## 验证方式'];
const CONTROL_PATTERN = /<(button|input|form|select|textarea)\b/i;
const NAVIGATION_PATTERN = /<a\b[^>]*\bhref=["'][^"']+["']/i;
const EXECUTABLE_INTERACTION_PATTERNS = [
  /\baddEventListener\s*\(\s*['"](click|submit|change|input|keydown|keyup|toggle)['"]/i,
  /\bon(click|submit|change|input|keydown|keyup|toggle)\s*=/i,
  /<form\b[^>]*\baction=["'][^"']+["']/i,
  /<a\b[^>]*\bhref=["'](?:#|\.\/|\/|[^"']+\.html\b)/i,
  /\blocation\.(href|assign|replace)\s*=/i,
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listHtmlFiles(root) {
  const prototypeDir = path.join(root, 'prototype');
  if (!fs.existsSync(prototypeDir)) {
    return [];
  }

  const entries = fs.readdirSync(prototypeDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map(entry => path.join('prototype', entry.name))
    .sort();
}

function hasExecutableInteraction(content) {
  return EXECUTABLE_INTERACTION_PATTERNS.some(pattern => pattern.test(content));
}

function verifyPrototype(root = process.cwd()) {
  const issues = [];
  const docsPath = path.join(root, 'docs', 'prototype.md');
  const pages = listHtmlFiles(root);

  if (!fs.existsSync(docsPath)) {
    issues.push('缺少 docs/prototype.md');
  } else {
    const doc = readText(docsPath);
    const missingSections = REQUIRED_DOC_SECTIONS.filter(section => !doc.includes(section));
    if (missingSections.length > 0) {
      issues.push(`docs/prototype.md 缺少必需章节：${missingSections.join('、')}`);
    }

    pages.forEach(page => {
      if (!doc.includes(page)) {
        issues.push(`docs/prototype.md 的页面清单或验证方式未记录 ${page}`);
      }
    });
  }

  if (pages.length === 0) {
    issues.push('prototype/ 下缺少 HTML 原型页面');
  }

  if (!pages.includes('prototype/index.html')) {
    issues.push('缺少 prototype/index.html');
  }

  pages.forEach(page => {
    const absolutePath = path.join(root, page);
    const content = readText(absolutePath);

    if (!/<!doctype html/i.test(content)) {
      issues.push(`${page} 缺少 <!doctype html>`);
    }

    if (!CONTROL_PATTERN.test(content) && !NAVIGATION_PATTERN.test(content)) {
      issues.push(`${page} 缺少可操作控件或页面导航`);
    }

    if (!hasExecutableInteraction(content)) {
      issues.push(`${page} 缺少可执行交互，例如 addEventListener、内联事件、表单 action 或页面跳转链接`);
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    pages,
  };
}

function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = verifyPrototype(root);

  if (!result.ok) {
    console.error(`❌ 原型校验失败：${result.issues.join('；')}`);
    process.exit(1);
  }

  console.log(`✅ 原型校验通过：${result.pages.join(', ')}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyPrototype,
};
