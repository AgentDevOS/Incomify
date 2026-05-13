#!/usr/bin/env node
'use strict';

const {
  buildAwaitingApprovalMessage,
  buildReadyHint,
  getInvalidDeliverables,
  getMissingChecks,
  getMissingFiles,
} = require('../workflow/config');
const { appendAudit, MEMORY_FILES, readState, stateExists } = require('../workflow/state');
const { buildVerificationReport } = require('../workflow/verification');

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

  let state;
  try {
    state = readState();
  } catch {
    if (raw) {
      process.stdout.write(raw);
    }
    process.exit(0);
    return;
  }

  const missingFiles = getMissingFiles(state);
  const invalidDeliverables = getInvalidDeliverables(state);
  const pendingChecks = state.pendingApproval && Array.isArray(state.pendingApproval.checks)
    ? state.pendingApproval.checks
    : [];
  const missingChecks = state.awaitingApproval ? getMissingChecks(state, pendingChecks) : [];
  const verification = ['development', 'delivery'].includes(state.currentStage)
    ? buildVerificationReport(state.currentStage)
    : state.lastVerification;

  if (state.awaitingApproval) {
    process.stderr.write(buildAwaitingApprovalMessage(state) + '\n');
    appendAudit('STOP', `等待确认: ${state.currentStage}`);
  } else if (missingFiles.length === 0) {
    process.stderr.write(buildReadyHint(state) + '\n');
    appendAudit('STOP', `阶段可申请确认: ${state.currentStage}`);
  } else {
    process.stderr.write(`ℹ️ 当前阶段尚未完成，缺少文件：${missingFiles.join(', ')}\n`);
    appendAudit('STOP', `阶段未完成: ${state.currentStage}`);
  }

  if (missingChecks.length > 0) {
    process.stderr.write(`ℹ️ 当前待确认阶段仍缺少检查：${missingChecks.join(', ')}\n`);
  }

  if (invalidDeliverables.length > 0) {
    process.stderr.write(`ℹ️ 当前阶段产物内容仍需补齐：${invalidDeliverables.join('；')}\n`);
  }

  if (verification && verification.tier) {
    process.stderr.write(`ℹ️ 当前验证等级：${verification.tier}，原因：${verification.reason}\n`);
  }

  process.stderr.write(`ℹ️ 阶段记忆文件：${MEMORY_FILES.stage} | ${MEMORY_FILES.decision} | ${MEMORY_FILES.issue}\n`);

  if (raw) {
    process.stdout.write(raw);
  }
  process.exit(0);
});
