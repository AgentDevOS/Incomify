'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOW_DIR = path.resolve('.workflow');
const STATE_FILE = path.join(WORKFLOW_DIR, 'state.json');
const AUDIT_LOG = path.join(WORKFLOW_DIR, 'audit.log');
const MEMORY_FILES = {
  decision: path.join(WORKFLOW_DIR, 'decisions.md'),
  issue: path.join(WORKFLOW_DIR, 'issues.md'),
  stage: path.join(WORKFLOW_DIR, 'stage-notes.md'),
};

function nowIso() {
  return new Date().toISOString();
}

function ensureWorkflowDir() {
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
}

function ensureMemoryFiles() {
  ensureWorkflowDir();

  const templates = {
    decision: '# 决策记录\n\n',
    issue: '# 问题记录\n\n',
    stage: '# 阶段记录\n\n',
  };

  Object.entries(MEMORY_FILES).forEach(([key, filePath]) => {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, templates[key], 'utf8');
    }
  });
}

function createInitialState(projectName) {
  return {
    version: 2,
    projectName: String(projectName || 'unnamed-project'),
    currentStage: 'requirements_analysis',
    awaitingApproval: false,
    pendingApproval: null,
    pendingFeedback: '',
    customAllowedPaths: [],
    history: [],
    lastVerification: null,
    updatedAt: nowIso(),
  };
}

function stateExists() {
  return fs.existsSync(STATE_FILE);
}

function readState() {
  if (!stateExists()) {
    throw new Error('状态文件不存在，请先执行: node scripts/workflow/gate.js init "项目名称"');
  }

  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function writeState(state) {
  ensureWorkflowDir();
  ensureMemoryFiles();
  const next = {
    ...state,
    updatedAt: nowIso(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

function appendAudit(action, detail) {
  ensureWorkflowDir();
  fs.appendFileSync(AUDIT_LOG, `[${nowIso()}] ${action}: ${detail}\n`, 'utf8');
}

function appendMemory(category, stageId, detail) {
  const filePath = MEMORY_FILES[category];
  if (!filePath) {
    return;
  }

  ensureMemoryFiles();
  const stage = stageId || '-';
  const entry = [
    `## ${nowIso()} | ${stage}`,
    '',
    String(detail || '').trim() || '(空记录)',
    '',
  ].join('\n');
  fs.appendFileSync(filePath, entry, 'utf8');
}

module.exports = {
  AUDIT_LOG,
  MEMORY_FILES,
  STATE_FILE,
  appendAudit,
  appendMemory,
  createInitialState,
  ensureMemoryFiles,
  ensureWorkflowDir,
  readState,
  stateExists,
  writeState,
};
