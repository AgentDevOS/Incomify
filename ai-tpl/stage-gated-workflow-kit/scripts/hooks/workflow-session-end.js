#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getStage } = require('../workflow/config');
const { readState, stateExists } = require('../workflow/state');

const SUMMARY_PATH = path.resolve('.workflow/session-summary.md');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});

process.stdin.on('end', () => {
  if (stateExists()) {
    try {
      const state = readState();
      const stage = getStage(state.currentStage);
      fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
      fs.appendFileSync(SUMMARY_PATH, [
        `## ${new Date().toISOString()}`,
        '',
        `- 当前阶段：${stage ? stage.label : state.currentStage}`,
        `- 等待确认：${state.awaitingApproval ? '是' : '否'}`,
        `- 待处理反馈：${state.pendingFeedback || '无'}`,
        '',
      ].join('\n'), 'utf8');
    } catch {
      // ignore summary write errors
    }
  }

  if (raw) {
    process.stdout.write(raw);
  }
  process.exit(0);
});
