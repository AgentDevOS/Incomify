#!/usr/bin/env node
'use strict';

const { buildReadyHint, getStage } = require('../workflow/config');
const { MEMORY_FILES, readState, stateExists } = require('../workflow/state');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});

process.stdin.on('end', () => {
  if (!stateExists()) {
    if (raw) {
      process.stdout.write(raw);
    }
    process.exit(0);
    return;
  }

  try {
    const state = readState();
    const stage = getStage(state.currentStage);
    const lines = [
      `ℹ️ 会话恢复到 ${stage ? stage.label : state.currentStage}`,
      state.awaitingApproval ? 'ℹ️ 当前仍在等待用户确认。' : buildReadyHint(state),
      'ℹ️ 如需补充上下文，可查看：',
      `- ${MEMORY_FILES.stage}`,
      `- ${MEMORY_FILES.decision}`,
      `- ${MEMORY_FILES.issue}`,
    ];
    process.stderr.write(lines.join('\n') + '\n');
  } catch {
    // ignore malformed state
  }

  if (raw) {
    process.stdout.write(raw);
  }
  process.exit(0);
});
