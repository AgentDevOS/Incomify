#!/usr/bin/env node
'use strict';

const {
  detectBlockedCommand,
  getAllowedWrites,
  getDeniedWrites,
  getStage,
  matchesPattern,
  normalizeRelativePath,
} = require('../workflow/config');
const { readState, stateExists } = require('../workflow/state');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});

function allow() {
  if (raw) {
    process.stdout.write(raw);
  }
  process.exit(0);
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function getWritePath(toolName, toolInput) {
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    return '';
  }

  return toolInput.file_path || toolInput.path || toolInput.notebook_path || '';
}

process.stdin.on('end', () => {
  if (!stateExists()) {
    allow();
    return;
  }

  let event = {};
  try {
    event = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    allow();
    return;
  }

  let state;
  try {
    state = readState();
  } catch {
    allow();
    return;
  }

  const stage = getStage(state.currentStage);
  if (!stage) {
    allow();
    return;
  }

  const toolName = event.tool_name || event.toolName || '';
  const toolInput = event.tool_input || event.toolInput || {};

  const targetPath = getWritePath(toolName, toolInput);
  if (targetPath) {
    const relativePath = normalizeRelativePath(targetPath);
    const deniedWrites = getDeniedWrites(state);
    const allowedWrites = getAllowedWrites(state);

    if (deniedWrites.some(pattern => matchesPattern(relativePath, pattern))) {
      block(`🛑 ${stage.label} 不允许写入 ${relativePath}。请留在当前阶段允许的目录内。`);
      return;
    }

    if (!allowedWrites.some(pattern => matchesPattern(relativePath, pattern))) {
      block([
        `🛑 ${stage.label} 不允许写入 ${relativePath}。`,
        '当前允许写入：',
        ...allowedWrites.map(pattern => `- ${pattern}`),
        '',
        '如确有必要，请把额外路径加入 .workflow/state.json 的 customAllowedPaths。',
      ].join('\n'));
      return;
    }
  }

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    const reason = detectBlockedCommand(command, state);
    if (reason) {
      block(`🛑 ${stage.label}：${reason}`);
      return;
    }
  }

  allow();
});
