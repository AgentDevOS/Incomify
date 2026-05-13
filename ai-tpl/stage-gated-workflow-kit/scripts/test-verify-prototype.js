'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyPrototype } = require('./verify-prototype');
const { getInvalidDeliverables } = require('./workflow/config');

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function withTempProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-prototype-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function basePrototypeDoc(extra = '') {
  return [
    '# 原型说明',
    '',
    '## 页面清单',
    '',
    '- prototype/index.html',
    '',
    '## 关键交互',
    '',
    '- 点击保存按钮后显示保存结果。',
    '',
    '## 验证方式',
    '',
    '- 已检查 prototype/index.html，可通过按钮验证关键路径。',
    extra,
    '',
  ].join('\n');
}

function interactiveHtml() {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>Prototype</title></head>',
    '<body>',
    '  <form id="task-form">',
    '    <input id="task-name" value="demo">',
    '    <button type="submit">保存</button>',
    '  </form>',
    '  <p id="result" aria-live="polite"></p>',
    '  <script>',
    "    document.getElementById('task-form').addEventListener('submit', function (event) {",
    '      event.preventDefault();',
    "      document.getElementById('result').textContent = '已保存';",
    '    });',
    '  </script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

withTempProject(root => {
  writeFile(root, 'docs/prototype.md', basePrototypeDoc());
  writeFile(root, 'prototype/index.html', interactiveHtml());

  const result = verifyPrototype(root);

  assert.deepStrictEqual(result.issues, []);
  assert.strictEqual(result.pages.length, 1);
});

withTempProject(root => {
  writeFile(root, 'docs/prototype.md', basePrototypeDoc());
  writeFile(root, 'prototype/index.html', [
    '<!doctype html>',
    '<html><body>',
    '<button>保存</button>',
    '</body></html>',
  ].join('\n'));

  const result = verifyPrototype(root);

  assert(result.issues.some(issue => issue.includes('缺少可执行交互')));
  assert(getInvalidDeliverables({ currentStage: 'prototype' }, root).some(issue => issue.includes('缺少可执行交互')));
});

withTempProject(root => {
  writeFile(root, 'docs/prototype.md', basePrototypeDoc('- 已检查 prototype/detail.html。'));
  writeFile(root, 'prototype/index.html', interactiveHtml());
  writeFile(root, 'prototype/detail.html', interactiveHtml());

  const result = verifyPrototype(root);

  assert.strictEqual(result.pages.length, 2);
  assert.deepStrictEqual(result.issues, []);
});

console.log('verify-prototype tests passed');
