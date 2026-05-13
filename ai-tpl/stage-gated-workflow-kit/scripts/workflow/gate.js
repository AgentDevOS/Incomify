#!/usr/bin/env node
'use strict';

const {
  buildAwaitingApprovalMessage,
  buildReadyHint,
  getInvalidCheckEvidence,
  getInvalidDeliverables,
  getMissingChecks,
  getMissingFiles,
  getStage,
} = require('./config');
const {
  appendAudit,
  appendMemory,
  createInitialState,
  ensureMemoryFiles,
  readState,
  writeState,
} = require('./state');
const {
  buildVerificationReport,
  writeStageBaseline,
  writeVerificationReport,
} = require('./verification');

const NOTE_CATEGORY_MAP = {
  decision: 'decision',
  issue: 'issue',
  stage: 'stage',
};

function printUsage() {
  console.log([
    'Stage-Gated Workflow',
    '',
    '用法：',
    '  node scripts/workflow/gate.js init <项目名称>',
    '  node scripts/workflow/gate.js status',
    '  node scripts/workflow/gate.js ready --summary "阶段说明" [--checks lint,test,review,build]',
    '  node scripts/workflow/gate.js confirm',
    '  node scripts/workflow/gate.js reject "反馈内容"',
    '  node scripts/workflow/gate.js verify-tier',
    '  node scripts/workflow/gate.js note <decision|issue|stage> "记录内容"',
    '  node scripts/workflow/gate.js gate',
  ].join('\n'));
}

function parseOptions(args) {
  const result = {
    positionals: [],
    summary: '',
    checks: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--summary') {
      result.summary = args[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--checks') {
      const raw = args[index + 1] || '';
      result.checks = raw.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }

    result.positionals.push(arg);
  }

  return result;
}

function requireState() {
  try {
    return readState();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

function formatVerificationLine(report) {
  if (!report) {
    return '-';
  }

  return `${report.tier} | ${report.filesChanged} 个文件 | ${report.estimatedLinesChanged} 行 | ${report.reason}`;
}

function renderStatus(state) {
  const stage = getStage(state.currentStage);
  const pending = state.awaitingApproval ? '是' : '否';
  const pendingSummary = state.pendingApproval && state.pendingApproval.summary
    ? state.pendingApproval.summary
    : '-';
  const checks = state.pendingApproval && Array.isArray(state.pendingApproval.checks)
    ? state.pendingApproval.checks.join(', ')
    : '-';
  const missingFiles = getMissingFiles(state);
  const invalidDeliverables = getInvalidDeliverables(state);
  const verification = ['development', 'delivery'].includes(state.currentStage)
    ? buildVerificationReport(state.currentStage)
    : state.lastVerification;

  console.log([
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `项目：${state.projectName}`,
    `当前阶段：${stage ? stage.label : state.currentStage}`,
    `等待确认：${pending}`,
    `阶段摘要：${pendingSummary}`,
    `阶段检查：${checks || '-'}`,
    `待处理反馈：${state.pendingFeedback || '-'}`,
    `缺少文件：${missingFiles.length > 0 ? missingFiles.join(', ') : '-'}`,
    `内容契约：${invalidDeliverables.length > 0 ? invalidDeliverables.join('；') : '通过'}`,
    `验证等级：${formatVerificationLine(verification)}`,
    `更新时间：${state.updatedAt}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n'));

  if (state.awaitingApproval) {
    console.log(buildAwaitingApprovalMessage(state));
  } else {
    console.log(buildReadyHint(state));
  }
}

function writeInitialArtifacts(state) {
  ensureMemoryFiles();
  writeStageBaseline(state.currentStage);
  appendMemory('stage', state.currentStage, `项目初始化：${state.projectName}`);
}

function updateVerificationState(state) {
  if (state.currentStage !== 'development') {
    return null;
  }

  const verification = writeVerificationReport(state.currentStage);
  state.lastVerification = verification;
  return verification;
}

function main() {
  const [, , command, ...restArgs] = process.argv;
  const options = parseOptions(restArgs);

  switch (command) {
    case 'init': {
      const projectName = options.positionals.join(' ') || 'unnamed-project';
      const state = writeState(createInitialState(projectName));
      writeInitialArtifacts(state);
      appendAudit('INIT', `项目初始化: ${state.projectName}`);
      console.log(`✅ 已初始化项目：${state.projectName}`);
      console.log(buildReadyHint(state));
      return;
    }

    case 'status': {
      renderStatus(requireState());
      return;
    }

    case 'ready': {
      const state = requireState();
      const stage = getStage(state.currentStage);

      if (!stage || stage.id === 'done') {
        console.log('✅ 当前已经没有可确认的阶段。');
        return;
      }

      if (state.awaitingApproval) {
        console.error('❌ 当前已经处于等待确认状态，请先 confirm 或 reject。');
        process.exit(1);
      }

      const missingFiles = getMissingFiles(state);
      if (missingFiles.length > 0) {
        console.error(`❌ 当前阶段缺少必要文件：${missingFiles.join(', ')}`);
        process.exit(1);
      }

      const invalidDeliverables = getInvalidDeliverables(state);
      if (invalidDeliverables.length > 0) {
        console.error(`❌ 当前阶段产物内容不符合要求：${invalidDeliverables.join('；')}`);
        process.exit(1);
      }

      const missingChecks = getMissingChecks(state, options.checks);
      if (missingChecks.length > 0) {
        console.error(`❌ 当前阶段缺少必要检查：${missingChecks.join(', ')}`);
        process.exit(1);
      }

      const verification = updateVerificationState(state);
      const invalidCheckEvidence = getInvalidCheckEvidence(state, options.checks);
      if (invalidCheckEvidence.length > 0) {
        console.error(`❌ 当前阶段缺少有效测试凭证：${invalidCheckEvidence.join('；')}`);
        process.exit(1);
      }

      const summary = options.summary || `${stage.label}已完成`;

      state.awaitingApproval = true;
      state.pendingApproval = {
        stageId: stage.id,
        summary,
        checks: options.checks,
        verification: verification
          ? {
              tier: verification.tier,
              reason: verification.reason,
            }
          : null,
        requestedAt: new Date().toISOString(),
      };
      state.pendingFeedback = '';

      writeState(state);
      appendAudit('READY', `${stage.id} 请求确认`);
      appendMemory('stage', stage.id, [
        `申请确认：${summary}`,
        options.checks.length > 0 ? `检查：${options.checks.join(', ')}` : '检查：无',
        verification ? `验证等级：${verification.tier}（${verification.reason}）` : '',
      ].filter(Boolean).join('\n'));

      console.log(buildAwaitingApprovalMessage(state));
      return;
    }

    case 'confirm': {
      const state = requireState();
      const stage = getStage(state.currentStage);

      if (!stage) {
        console.error('❌ 当前阶段无效。');
        process.exit(1);
      }

      if (!state.awaitingApproval || !state.pendingApproval) {
        console.error('❌ 当前没有待确认阶段，请先执行 ready。');
        process.exit(1);
      }

      state.history.push({
        stageId: stage.id,
        outcome: 'confirmed',
        summary: state.pendingApproval.summary,
        checks: state.pendingApproval.checks,
        verification: state.pendingApproval.verification || null,
        confirmedAt: new Date().toISOString(),
      });

      state.awaitingApproval = false;
      state.pendingApproval = null;
      state.pendingFeedback = '';
      state.currentStage = stage.nextStageId || 'done';
      state.lastVerification = null;

      const nextState = writeState(state);
      appendAudit('CONFIRM', `${stage.id} -> ${nextState.currentStage}`);
      if (nextState.currentStage !== 'done') {
        writeStageBaseline(nextState.currentStage);
      }

      const nextStage = getStage(nextState.currentStage);
      appendMemory('decision', stage.id, `阶段确认通过：${stage.id} -> ${nextState.currentStage}`);
      console.log(`✅ 已确认，进入${nextStage ? nextStage.label : nextState.currentStage}`);
      console.log(buildReadyHint(nextState));
      return;
    }

    case 'reject': {
      const state = requireState();
      const stage = getStage(state.currentStage);
      const feedback = options.positionals.join(' ').trim();

      if (!stage) {
        console.error('❌ 当前阶段无效。');
        process.exit(1);
      }

      if (!state.awaitingApproval || !state.pendingApproval) {
        console.error('❌ 当前没有待确认阶段，请先执行 ready。');
        process.exit(1);
      }

      if (!feedback) {
        console.error('❌ reject 需要填写反馈内容。');
        process.exit(1);
      }

      state.awaitingApproval = false;
      state.pendingApproval = null;
      state.pendingFeedback = feedback;

      const nextState = writeState(state);
      appendAudit('REJECT', `${stage.id}: ${feedback}`);
      appendMemory('issue', stage.id, `阶段被拒绝：${feedback}`);

      console.log(`🔄 已拒绝当前阶段，继续停留在${stage.label}`);
      console.log(`反馈：${feedback}`);
      console.log(buildReadyHint(nextState));
      return;
    }

    case 'verify-tier': {
      const state = requireState();
      const report = writeVerificationReport(state.currentStage);
      state.lastVerification = report;
      writeState(state);

      console.log([
        '验证等级结果',
        `- 阶段：${state.currentStage}`,
        `- 等级：${report.tier}`,
        `- 原因：${report.reason}`,
        `- 改动文件数：${report.filesChanged}`,
        `- 估算改动行数：${report.estimatedLinesChanged}`,
        `- 测试覆盖：${report.testCoverage}`,
        `- 架构变更：${report.hasArchitecturalChanges ? '是' : '否'}`,
        `- 安全敏感：${report.hasSecurityImplications ? '是' : '否'}`,
        `- 证据要求：${report.evidenceRequired}`,
        report.warnings && report.warnings.length > 0 ? `- 警告：${report.warnings.join('；')}` : '',
      ].filter(Boolean).join('\n'));
      return;
    }

    case 'note': {
      const state = requireState();
      const [rawCategory, ...rest] = options.positionals;
      const category = NOTE_CATEGORY_MAP[String(rawCategory || '').trim()];
      const detail = rest.join(' ').trim();

      if (!category) {
        console.error('❌ note 只支持 decision、issue、stage 三类。');
        process.exit(1);
      }

      if (!detail) {
        console.error('❌ note 需要填写记录内容。');
        process.exit(1);
      }

      appendMemory(category, state.currentStage, detail);
      appendAudit('NOTE', `${category}: ${detail}`);
      console.log(`✅ 已写入 ${category} 记录。`);
      return;
    }

    case 'gate': {
      const state = requireState();
      console.log(state.awaitingApproval ? buildAwaitingApprovalMessage(state) : buildReadyHint(state));
      return;
    }

    default: {
      printUsage();
    }
  }
}

main();
