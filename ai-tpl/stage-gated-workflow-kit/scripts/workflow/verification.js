'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKFLOW_DIR = path.resolve('.workflow');
const BASELINE_DIR = path.join(WORKFLOW_DIR, 'stage-baselines');
const VERIFICATION_REPORT_PATH = path.join(WORKFLOW_DIR, 'verification-report.json');

const IGNORED_DIRS = new Set(['.git', 'node_modules']);
const IGNORED_EXACT_PATHS = new Set([
  '.workflow/state.json',
  '.workflow/audit.log',
  '.workflow/verification-report.json',
  '.workflow/cli-run-state.json',
  '.workflow/cli-run-summary.json',
  '.workflow/cli-run-summary.md',
]);

const ARCHITECTURAL_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)tsconfig\.json$/,
  /(^|\/).+config\.(?:[cm]?js|json|ts)$/,
  /(^|\/)schema\.(?:ts|prisma|sql)$/,
  /(^|\/)definitions\.ts$/,
  /(^|\/)types\.ts$/,
];

const SECURITY_PATTERNS = [
  /(^|\/)auth\//,
  /(^|\/)security\//,
  /(^|\/)permissions?\.(?:[cm]?js|ts)$/,
  /(^|\/)credentials?\.(?:[cm]?js|json|ya?ml|ts)$/,
  /(^|\/)secrets?\.(?:[cm]?js|json|ya?ml|ts)$/,
  /(^|\/)tokens?\.(?:[cm]?js|json|ts)$/,
  /(^|\/)passwords?\.(?:[cm]?js|json|ts)$/,
  /(^|\/)oauth/i,
  /(^|\/)jwt/i,
  /(^|\/)\.env/i,
];

function ensureWorkflowDir() {
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
}

function ensureBaselineDir() {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function shouldIgnorePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return false;
  }

  if (IGNORED_EXACT_PATHS.has(normalized)) {
    return true;
  }

  if (normalized === '.workflow/stage-baselines' || normalized.startsWith('.workflow/stage-baselines/')) {
    return true;
  }

  return false;
}

function listTrackedFiles(rootDir, currentDir = rootDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  entries.forEach(entry => {
    if (IGNORED_DIRS.has(entry.name)) {
      return;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));

    if (shouldIgnorePath(relativePath)) {
      return;
    }

    if (entry.isDirectory()) {
      files.push(...listTrackedFiles(rootDir, absolutePath));
      return;
    }

    files.push(relativePath);
  });

  return files.sort();
}

function getLineCount(buffer) {
  if (buffer.length === 0) {
    return 0;
  }

  const text = buffer.toString('utf8');
  return text.split(/\r?\n/).length;
}

function buildSnapshot(cwd = process.cwd()) {
  const snapshot = {};

  listTrackedFiles(cwd).forEach(relativePath => {
    const absolutePath = path.join(cwd, relativePath);
    const buffer = fs.readFileSync(absolutePath);
    snapshot[relativePath] = {
      bytes: buffer.length,
      lines: getLineCount(buffer),
      hash: crypto.createHash('sha1').update(buffer).digest('hex'),
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: snapshot,
  };
}

function getBaselinePath(stageId, cwd = process.cwd()) {
  return path.join(cwd, '.workflow', 'stage-baselines', `${stageId}.json`);
}

function writeStageBaseline(stageId, cwd = process.cwd()) {
  if (!stageId) {
    return null;
  }

  ensureWorkflowDir();
  ensureBaselineDir();
  const snapshot = buildSnapshot(cwd);
  const targetPath = getBaselinePath(stageId, cwd);
  fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return snapshot;
}

function readStageBaseline(stageId, cwd = process.cwd()) {
  if (!stageId) {
    return null;
  }

  const targetPath = getBaselinePath(stageId, cwd);
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch {
    return null;
  }
}

function detectCoverageLevel(report) {
  if (!report || typeof report !== 'object' || report.overall !== 'passed') {
    return 'none';
  }

  const steps = report.steps && typeof report.steps === 'object' ? report.steps : {};
  const statuses = ['unit', 'integration', 'e2e'].map(stepId => steps[stepId] && steps[stepId].status === 'passed');
  if (statuses.every(Boolean)) {
    return 'full';
  }

  if (statuses.some(Boolean)) {
    return 'partial';
  }

  return 'none';
}

function readStructuredTestReport(cwd = process.cwd()) {
  const reportPath = path.join(cwd, 'docs', 'test-report.json');
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

function selectTier(metadata) {
  if (metadata.hasSecurityImplications || metadata.hasArchitecturalChanges) {
    return {
      tier: 'THOROUGH',
      reason: metadata.hasSecurityImplications
        ? '检测到安全敏感路径改动'
        : '检测到架构级改动',
      evidenceRequired: '完整代码审核 + 全量测试通过',
    };
  }

  if (metadata.filesChanged > 20) {
    return {
      tier: 'THOROUGH',
      reason: '改动文件数超过 20',
      evidenceRequired: '完整代码审核 + 全量测试通过',
    };
  }

  if (metadata.filesChanged < 5 && metadata.estimatedLinesChanged < 100 && metadata.testCoverage === 'full') {
    return {
      tier: 'LIGHT',
      reason: '改动范围较小且测试覆盖完整',
      evidenceRequired: '结构化诊断结果干净 + 关键测试通过',
    };
  }

  return {
    tier: 'STANDARD',
    reason: '默认验证强度',
    evidenceRequired: '结构化测试结果 + 构建通过',
  };
}

function buildVerificationReport(stageId, cwd = process.cwd()) {
  const baseline = readStageBaseline(stageId, cwd);
  const currentSnapshot = buildSnapshot(cwd);
  const report = readStructuredTestReport(cwd);
  const now = new Date().toISOString();

  if (!baseline || !baseline.files || typeof baseline.files !== 'object') {
    return {
      version: 1,
      generatedAt: now,
      stageId,
      status: 'baseline_missing',
      tier: 'STANDARD',
      reason: '缺少阶段基线，已回退为 STANDARD 验证等级',
      filesChanged: 0,
      estimatedLinesChanged: 0,
      testCoverage: detectCoverageLevel(report),
      hasArchitecturalChanges: false,
      hasSecurityImplications: false,
      changedPaths: [],
      evidenceRequired: '结构化测试结果 + 构建通过',
      warnings: ['当前阶段没有可比对的基线快照，建议按 init -> confirm 正常推进后再评估改动范围。'],
    };
  }

  const baselineFiles = baseline.files;
  const currentFiles = currentSnapshot.files;
  const changedPathSet = new Set([
    ...Object.keys(baselineFiles),
    ...Object.keys(currentFiles),
  ]);

  let estimatedLinesChanged = 0;
  const changedPaths = [];

  Array.from(changedPathSet).sort().forEach(relativePath => {
    const previous = baselineFiles[relativePath];
    const current = currentFiles[relativePath];

    if (!previous || !current || previous.hash !== current.hash) {
      changedPaths.push(relativePath);
      if (!previous) {
        estimatedLinesChanged += current.lines;
      } else if (!current) {
        estimatedLinesChanged += previous.lines;
      } else {
        estimatedLinesChanged += Math.max(previous.lines, current.lines);
      }
    }
  });

  const metadata = {
    filesChanged: changedPaths.length,
    estimatedLinesChanged,
    testCoverage: detectCoverageLevel(report),
    hasArchitecturalChanges: changedPaths.some(relativePath => ARCHITECTURAL_PATTERNS.some(pattern => pattern.test(relativePath))),
    hasSecurityImplications: changedPaths.some(relativePath => SECURITY_PATTERNS.some(pattern => pattern.test(relativePath))),
  };
  const tier = selectTier(metadata);

  return {
    version: 1,
    generatedAt: now,
    stageId,
    status: 'ok',
    tier: tier.tier,
    reason: tier.reason,
    filesChanged: metadata.filesChanged,
    estimatedLinesChanged: metadata.estimatedLinesChanged,
    testCoverage: metadata.testCoverage,
    hasArchitecturalChanges: metadata.hasArchitecturalChanges,
    hasSecurityImplications: metadata.hasSecurityImplications,
    changedPaths,
    evidenceRequired: tier.evidenceRequired,
    warnings: [],
  };
}

function writeVerificationReport(stageId, cwd = process.cwd()) {
  ensureWorkflowDir();
  const report = buildVerificationReport(stageId, cwd);
  fs.writeFileSync(path.join(cwd, '.workflow', 'verification-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

module.exports = {
  VERIFICATION_REPORT_PATH,
  buildVerificationReport,
  readStageBaseline,
  writeStageBaseline,
  writeVerificationReport,
};
