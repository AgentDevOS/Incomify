'use strict';

const fs = require('fs');
const path = require('path');
const { verifyPrototype } = require('../verify-prototype');

const WORKFLOW_RUNTIME_WRITES = [
  '.workflow/state.json',
  '.workflow/audit.log',
  '.workflow/decisions.md',
  '.workflow/issues.md',
  '.workflow/stage-notes.md',
  '.workflow/stage-baselines/',
  '.workflow/verification-report.json',
  '.workflow/cli-run-state.json',
  '.workflow/cli-run-summary.json',
  '.workflow/cli-run-summary.md',
];

const DEVELOPMENT_WORKFLOW_WRITES = [
  '.workflow/test-contract.json',
  '.workflow/e2e-report.json',
  '.workflow/api-report.json',
  '.workflow/preview-deploy.json',
];

const STAGES = [
  {
    id: 'requirements_analysis',
    label: '阶段 1：需求分析',
    nextStageId: 'prototype',
    requiredFiles: ['docs/requirement.md'],
    requiredChecks: [],
    allowedWrites: [
      ...WORKFLOW_RUNTIME_WRITES,
      'docs/requirement.md',
    ],
    deniedWrites: ['src/', 'prototype/', 'dist/', 'release/'],
  },
  {
    id: 'prototype',
    label: '阶段 2：原型',
    nextStageId: 'development',
    requiredFiles: ['docs/prototype.md', 'prototype/index.html'],
    requiredChecks: [],
    allowedWrites: [
      ...WORKFLOW_RUNTIME_WRITES,
      'docs/requirement.md',
      'docs/prototype.md',
      'prototype/',
    ],
    deniedWrites: ['src/', 'dist/', 'release/'],
  },
  {
    id: 'development',
    label: '阶段 3：开发与测试',
    nextStageId: 'delivery',
    requiredFiles: ['.workflow/test-contract.json', '.workflow/preview-deploy.json', 'docs/test-report.md', 'docs/test-report.json', 'docs/code-review.md'],
    requiredChecks: ['lint', 'test', 'review', 'build'],
    allowedWrites: [
      ...WORKFLOW_RUNTIME_WRITES,
      ...DEVELOPMENT_WORKFLOW_WRITES,
      'docs/requirement.md',
      'docs/prototype.md',
      'docs/code-review.md',
      'docs/test-report.md',
      'docs/test-report.json',
      'docs/uat-feedback.md',
      'src/',
      'lib/',
      'integration_test/',
      'patrol/',
    ],
    deniedWrites: ['dist/', 'release/'],
  },
  {
    id: 'delivery',
    label: '阶段 4：交付',
    nextStageId: 'done',
    requiredFiles: ['docs/delivery.md'],
    requiredChecks: [],
    allowedWrites: [
      ...WORKFLOW_RUNTIME_WRITES,
      'docs/requirement.md',
      'docs/prototype.md',
      'docs/uat-feedback.md',
      'docs/delivery.md',
      'dist/',
      'release/',
    ],
    deniedWrites: [],
  },
  {
    id: 'done',
    label: '完成',
    nextStageId: null,
    requiredFiles: [],
    requiredChecks: [],
    allowedWrites: ['*'],
    deniedWrites: [],
  },
];

const DEFAULT_DELIVERABLE_CONTRACT = {
  requirements_analysis: {
    rules: [
      {
        path: 'docs/requirement.md',
        minLines: 12,
        requiredSections: ['## 项目概述', '## 功能需求', '## 用户使用场景', '## 验收范围', '## 非目标', '## 需求澄清'],
      },
    ],
  },
  prototype: {
    rules: [
      {
        path: 'docs/prototype.md',
        minLines: 10,
        requiredSections: ['## 页面清单', '## 关键交互', '## 验证方式'],
      },
      {
        path: 'prototype/index.html',
        minLines: 8,
        requiredPatterns: ['<!doctype html', '<(button|input|form|select|textarea)\\b'],
      },
    ],
  },
  development: {
    rules: [
      {
        path: 'docs/test-report.md',
        minLines: 20,
        requiredPatterns: ['# 测试报告', '- 最终结论：通过', '## 验证等级'],
      },
      {
        path: 'docs/code-review.md',
        minLines: 12,
        requiredSections: ['## 概览', '## 审核标准', '## 审核摘要'],
        requiredPatterns: ['- 审核结论：通过'],
      },
    ],
  },
  delivery: {
    rules: [
      {
        path: 'docs/delivery.md',
        minLines: 10,
        requiredSections: ['## 交付物', '## 启动方式', '## 已知风险'],
      },
    ],
  },
};

const ALWAYS_BLOCKED_COMMANDS = [
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    reason: '检测到 git reset --hard。该命令具有破坏性，请人工审查后单独执行。',
  },
  {
    pattern: /\brm\s+-rf\b/,
    reason: '检测到 rm -rf。该命令具有破坏性，请人工审查后单独执行。',
  },
  {
    pattern: /\bgit\s+push\b.*\s--force\b|\bgit\s+push\s+--force\b/,
    reason: '检测到 git push --force。该命令具有高风险，请人工审查后单独执行。',
  },
];

const DELIVERY_ONLY_COMMANDS = [
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/,
    reason: '发布包命令只允许在交付阶段执行。',
  },
  {
    pattern: /\bdocker\s+push\b/,
    reason: '推送镜像只允许在交付阶段执行。',
  },
  {
    pattern: /\b(?:vercel|netlify)\b.*\bdeploy\b|\b(?:vercel|netlify)\b/,
    reason: '部署命令只允许在交付阶段执行。',
  },
  {
    pattern: /\bgh\s+release\b/,
    reason: '创建 release 只允许在交付阶段执行。',
  },
  {
    pattern: /\bscp\b|\brsync\b/,
    reason: '分发制品类命令只允许在交付阶段执行。',
  },
];

const EXPECTED_E2E_FRAMEWORKS = {
  flutter: ['patrol'],
  react_native: ['detox'],
  web: ['playwright'],
  native_ios: ['xcuitest'],
  native_android: ['espresso'],
  native_dual: ['xcuitest', 'espresso'],
  miniprogram_native: ['miniprogram-automator'],
};

const SUPPORTED_DELIVERY_TARGETS = new Set(['web', 'ios', 'android', 'mini_program_native']);

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __parseError: error.message };
  }
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeHttpMethod(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeApiPath(value) {
  const pathValue = String(value || '').trim();
  if (!pathValue) {
    return '';
  }

  const withLeadingSlash = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

function normalizeApiEndpoint(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^([A-Za-z]+)\s+(.+)$/);
    if (!match) {
      return {
        method: '',
        path: normalizeApiPath(value),
      };
    }

    return {
      method: normalizeHttpMethod(match[1]),
      path: normalizeApiPath(match[2]),
    };
  }

  if (!value || typeof value !== 'object') {
    return {
      method: '',
      path: '',
    };
  }

  return {
    method: normalizeHttpMethod(value.method),
    path: normalizeApiPath(value.path),
  };
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBackendContract(contract) {
  return contract && contract.backend && typeof contract.backend === 'object'
    ? contract.backend
    : null;
}

function getBackendApiEndpoints(contract) {
  const backend = getBackendContract(contract);
  if (!backend || !Array.isArray(backend.apiPaths)) {
    return [];
  }

  return backend.apiPaths.map(normalizeApiEndpoint);
}

function formatApiEndpoint(endpoint) {
  return `${endpoint.method} ${endpoint.path}`.trim();
}

function validateBackendContract(contract) {
  const backend = getBackendContract(contract);
  if (!backend) {
    return [];
  }

  const issues = [];
  const language = String(backend.language || '').trim().toLowerCase();
  const framework = String(backend.framework || '').trim().toLowerCase();
  const database = String(backend.database || '').trim().toLowerCase();

  if (language !== 'rust') {
    issues.push('backend.language 必须是 rust');
  }

  if (framework !== 'axum') {
    issues.push('backend.framework 必须是 axum');
  }

  if (database !== 'sqlite') {
    issues.push('backend.database 必须是 sqlite');
  }

  if (!Array.isArray(backend.apiPaths) || backend.apiPaths.length === 0) {
    issues.push('backend.apiPaths 至少要声明 1 个后端 API');
    return issues;
  }

  const invalidEndpoints = getBackendApiEndpoints(contract).filter(endpoint => !endpoint.method || !endpoint.path);
  if (invalidEndpoints.length > 0) {
    issues.push('backend.apiPaths 中每个 API 都必须声明 method 和 path');
  }

  return issues;
}

function validateBackendApiCoverage(report, contract) {
  const requiredEndpoints = getBackendApiEndpoints(contract);
  if (requiredEndpoints.length === 0) {
    return [];
  }

  const api = report.api && typeof report.api === 'object' ? report.api : null;
  const cases = api && Array.isArray(api.cases) ? api.cases : [];
  if (cases.length === 0) {
    return ['docs/test-report.json 缺少 api.cases 结构化 API 测试记录'];
  }

  const passedCaseKeys = new Set();
  const invalidCases = [];

  cases.forEach(item => {
    const endpoint = normalizeApiEndpoint(item);
    const status = String(item && item.status || '').trim();
    const testFile = String(item && item.testFile || '').trim().replace(/\\/g, '/');

    if (!endpoint.method || !endpoint.path) {
      invalidCases.push('API 测试记录缺少 method 或 path');
      return;
    }

    if (status !== 'passed') {
      return;
    }

    if (!testFile.startsWith('src/backend/tests/')) {
      invalidCases.push(`${formatApiEndpoint(endpoint)} 的 API 测试记录必须提供 src/backend/tests/ 下的 testFile`);
      return;
    }

    passedCaseKeys.add(formatApiEndpoint(endpoint));
  });

  const issues = Array.from(new Set(invalidCases));
  requiredEndpoints.forEach(endpoint => {
    const key = formatApiEndpoint(endpoint);
    if (!passedCaseKeys.has(key)) {
      issues.push(`后端 API ${key} 缺少通过的 API 测试记录`);
    }
  });

  return issues;
}

function validateTestContract(contract) {
  const issues = [];

  if (!contract || typeof contract !== 'object' || contract.__parseError) {
    return ['.workflow/test-contract.json 不是有效的 JSON 文件'];
  }

  const implementationType = String(contract.implementationType || '').trim();
  if (!implementationType) {
    issues.push('test-contract 缺少 implementationType');
  }

  const expectedFrameworks = EXPECTED_E2E_FRAMEWORKS[implementationType];
  if (!expectedFrameworks) {
    issues.push(`test-contract 的 implementationType 不受支持：${implementationType || '空值'}`);
  }

  const deliveryTargets = normalizeStringArray(contract.deliveryTargets);
  if (deliveryTargets.length === 0) {
    issues.push('test-contract 缺少 deliveryTargets');
  } else {
    const invalidTargets = deliveryTargets.filter(target => !SUPPORTED_DELIVERY_TARGETS.has(target));
    if (invalidTargets.length > 0) {
      issues.push(`test-contract 存在不受支持的 deliveryTargets：${invalidTargets.join('、')}`);
    }
  }

  const e2e = contract.e2e && typeof contract.e2e === 'object' ? contract.e2e : null;
  if (!e2e) {
    issues.push('test-contract 缺少 e2e 配置');
    return issues;
  }

  const frameworks = normalizeStringArray(e2e.frameworks);
  if (frameworks.length === 0) {
    issues.push('test-contract.e2e.frameworks 不能为空');
  } else if (expectedFrameworks) {
    const missingFrameworks = expectedFrameworks.filter(framework => !frameworks.includes(framework));
    if (missingFrameworks.length > 0) {
      issues.push(`test-contract 的 E2E 框架不符合默认约束，${implementationType} 必须包含：${missingFrameworks.join('、')}`);
    }
  }

  const minimumRealE2ECount = Number(e2e.minimumRealE2ECount);
  if (!Number.isInteger(minimumRealE2ECount) || minimumRealE2ECount < 1) {
    issues.push('test-contract.e2e.minimumRealE2ECount 必须是大于等于 1 的整数');
  }

  const requiredRealE2EScenarios = normalizeStringArray(e2e.requiredRealE2EScenarios);
  if (requiredRealE2EScenarios.length === 0) {
    issues.push('test-contract.e2e.requiredRealE2EScenarios 至少要声明 1 条真实 E2E 场景');
  }

  issues.push(...validateBackendContract(contract));

  return issues;
}

function validateStructuredTestReport(report, contract) {
  const issues = [];
  if (!report || typeof report !== 'object' || report.__parseError) {
    return ['docs/test-report.json 不是有效的 JSON 文件'];
  }

  if (report.overall !== 'passed') {
    issues.push('docs/test-report.json 未显示 overall=passed');
  }

  const steps = report.steps && typeof report.steps === 'object' ? report.steps : {};
  ['unit', 'integration', 'e2e'].forEach(stepId => {
    if (!steps[stepId] || steps[stepId].status !== 'passed') {
      issues.push(`docs/test-report.json 缺少 ${stepId} 通过记录`);
    }
  });

  const verification = report.verification && typeof report.verification === 'object' ? report.verification : null;
  if (!verification) {
    issues.push('docs/test-report.json 缺少 verification 结构化结果');
  } else {
    if (!['LIGHT', 'STANDARD', 'THOROUGH'].includes(String(verification.tier || ''))) {
      issues.push('verification.tier 必须是 LIGHT、STANDARD 或 THOROUGH');
    }
    if (!verification.evidenceRequired) {
      issues.push('verification.evidenceRequired 不能为空');
    }
  }

  const e2e = report.e2e && typeof report.e2e === 'object' ? report.e2e : null;
  if (!e2e) {
    issues.push('docs/test-report.json 缺少 e2e 结构化结果');
    return issues;
  }

  const frameworks = normalizeStringArray(e2e.frameworks);
  const expectedFrameworks = EXPECTED_E2E_FRAMEWORKS[String(contract.implementationType || '').trim()] || [];
  const missingFrameworks = expectedFrameworks.filter(framework => !frameworks.includes(framework));
  if (missingFrameworks.length > 0) {
    issues.push(`结构化测试结果缺少期望的 E2E 框架：${missingFrameworks.join('、')}`);
  }

  const minimumRealE2ECount = Number(contract.e2e && contract.e2e.minimumRealE2ECount);
  const realE2EPassedCount = Number(e2e.realE2EPassedCount);
  if (!Number.isFinite(realE2EPassedCount) || realE2EPassedCount < minimumRealE2ECount) {
    issues.push(`真实 E2E 通过数不足，至少需要 ${minimumRealE2ECount} 条`);
  }

  const cases = Array.isArray(e2e.cases) ? e2e.cases : [];
  const passedRealCases = cases.filter(item => item && item.type === 'real_e2e' && item.status === 'passed');
  if (passedRealCases.length === 0) {
    issues.push('结构化测试结果中没有通过的真实 E2E 用例');
    return issues;
  }

  const requiredScenarioIds = normalizeStringArray(contract.e2e && contract.e2e.requiredRealE2EScenarios);
  const passedIds = new Set(passedRealCases.map(item => String(item.id || '').trim()).filter(Boolean));
  const missingScenarios = requiredScenarioIds.filter(id => !passedIds.has(id));
  if (missingScenarios.length > 0) {
    issues.push(`缺少必需真实 E2E 场景通过记录：${missingScenarios.join('、')}`);
  }

  const deliveryTargets = normalizeStringArray(contract.deliveryTargets);
  deliveryTargets.forEach(target => {
    const covered = passedRealCases.some(item => normalizeStringArray(item.platforms).includes(target));
    if (!covered) {
      issues.push(`交付目标 ${target} 缺少真实 E2E 通过记录`);
    }
  });

  issues.push(...validateBackendApiCoverage(report, contract));

  return issues;
}

function validatePreviewDeployReport(report) {
  const issues = [];
  if (!report || typeof report !== 'object' || report.__parseError) {
    return ['.workflow/preview-deploy.json 不是有效的 JSON 文件'];
  }

  const status = String(report.status || '').trim();
  if (!['ready_for_uat', 'deployed'].includes(status)) {
    issues.push('preview-deploy.status 必须是 ready_for_uat 或 deployed');
  }

  if (!report.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) {
    issues.push('preview-deploy.generatedAt 必须是有效时间');
  }

  const targets = Array.isArray(report.targets) ? report.targets : [];
  if (targets.length === 0) {
    issues.push('preview-deploy.targets 至少需要 1 个可验收目标');
    return issues;
  }

  const supportedStatuses = new Set(['built', 'deployed', 'published_to_preview']);
  const hasValidTarget = targets.some(target => {
    if (!target || typeof target !== 'object') {
      return false;
    }

    const targetType = String(target.type || '').trim();
    const targetStatus = String(target.status || '').trim();
    const artifact = String(target.artifact || '').trim();
    const url = String(target.url || target.previewUrl || '').trim();
    const note = String(target.note || '').trim();

    return Boolean(targetType && supportedStatuses.has(targetStatus) && (artifact || url || note));
  });

  if (!hasValidTarget) {
    issues.push('preview-deploy.targets 中没有有效的测试产物或预览环境记录');
  }

  return issues;
}

function getStage(stageId) {
  return STAGES.find(stage => stage.id === stageId) || null;
}

function normalizeRelativePath(targetPath, cwd = process.cwd()) {
  const raw = String(targetPath || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw.replace(/\\/g, '/');
  if (path.isAbsolute(raw)) {
    const rel = path.relative(cwd, raw).replace(/\\/g, '/');
    return rel.startsWith('../') ? normalized : rel;
  }

  return normalized.replace(/^\.\//, '');
}

function matchesPattern(relativePath, pattern) {
  if (pattern === '*') {
    return true;
  }

  const normalizedPattern = String(pattern || '').replace(/\\/g, '/');
  if (!normalizedPattern) {
    return false;
  }

  if (normalizedPattern.endsWith('/')) {
    const dir = normalizedPattern.slice(0, -1);
    return relativePath === dir || relativePath.startsWith(normalizedPattern);
  }

  return relativePath === normalizedPattern;
}

function stripShellQuotes(token) {
  return String(token || '').replace(/^['"]|['"]$/g, '');
}

function tokenizeShellCommand(command) {
  return String(command || '').match(/'[^']*'|"[^"]*"|\S+/g) || [];
}

function isWritableShellPath(token) {
  const value = stripShellQuotes(token);
  if (!value || value === '-' || value.startsWith('$') || value.includes('$(') || value.includes('`')) {
    return false;
  }

  return /[/.]/.test(value);
}

function extractShellWriteTargets(command) {
  const targets = new Set();
  const text = String(command || '');
  const tokens = tokenizeShellCommand(text);

  const addTarget = token => {
    if (!isWritableShellPath(token)) {
      return;
    }
    targets.add(stripShellQuotes(token));
  };

  const redirectionRegex = /(?:^|[\s;&|])(?:\d*>>?|\d*>\|)\s*(['"]?)([^'"`\s;&|]+)\1/g;
  let match;
  while ((match = redirectionRegex.exec(text)) !== null) {
    addTarget(match[2]);
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = stripShellQuotes(tokens[index]);

    if (token === 'tee') {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = stripShellQuotes(tokens[cursor]);
        if (!candidate || candidate.startsWith('-')) {
          continue;
        }
        addTarget(candidate);
        break;
      }
      continue;
    }

    if (['touch', 'mkdir', 'rm', 'rmdir'].includes(token)) {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = stripShellQuotes(tokens[cursor]);
        if (!candidate || candidate.startsWith('-')) {
          continue;
        }
        addTarget(candidate);
      }
      continue;
    }

    if (['cp', 'mv', 'install'].includes(token)) {
      const candidates = [];
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = stripShellQuotes(tokens[cursor]);
        if (!candidate || candidate.startsWith('-')) {
          continue;
        }
        candidates.push(candidate);
      }
      if (candidates.length > 0) {
        addTarget(candidates[candidates.length - 1]);
      }
      continue;
    }

    if ((token === 'sed' || token === 'perl') && tokens[index + 1] && /-i(?:$|['"])/.test(tokens[index + 1])) {
      for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
        const candidate = stripShellQuotes(tokens[cursor]);
        if (!candidate || candidate.startsWith('-') || /^s\W/.test(candidate)) {
          continue;
        }
        addTarget(candidate);
      }
    }
  }

  return Array.from(targets);
}

function getAllowedWrites(state) {
  const stage = getStage(state.currentStage);
  if (!stage) {
    return [];
  }

  const custom = Array.isArray(state.customAllowedPaths) ? state.customAllowedPaths : [];
  return [...stage.allowedWrites, ...custom];
}

function getDeniedWrites(state) {
  const stage = getStage(state.currentStage);
  return stage ? stage.deniedWrites : [];
}

function getMissingFiles(state, cwd = process.cwd()) {
  const stage = getStage(state.currentStage);
  if (!stage) {
    return [];
  }

  return stage.requiredFiles.filter(file => !fs.existsSync(path.resolve(cwd, file)));
}

function readDeliverableContract(cwd = process.cwd()) {
  const contractPath = path.resolve(cwd, '.workflow/deliverables.json');
  if (!fs.existsSync(contractPath)) {
    return DEFAULT_DELIVERABLE_CONTRACT;
  }

  const overrideContract = readJsonFileSafe(contractPath);
  if (overrideContract.__parseError) {
    return DEFAULT_DELIVERABLE_CONTRACT;
  }

  const merged = { ...DEFAULT_DELIVERABLE_CONTRACT };
  Object.keys(overrideContract).forEach(stageId => {
    merged[stageId] = {
      ...(DEFAULT_DELIVERABLE_CONTRACT[stageId] || {}),
      ...(overrideContract[stageId] || {}),
    };
  });
  return merged;
}

function getInvalidDeliverables(state, cwd = process.cwd()) {
  const stage = getStage(state.currentStage);
  if (!stage) {
    return [];
  }

  const contract = readDeliverableContract(cwd)[stage.id];
  if (!contract || !Array.isArray(contract.rules)) {
    return [];
  }

  const issues = [];
  contract.rules.forEach(rule => {
    const absolutePath = path.resolve(cwd, rule.path);
    if (!fs.existsSync(absolutePath)) {
      return;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);

    if (Number.isInteger(rule.minLines) && lines.length < rule.minLines) {
      issues.push(`${rule.path} 行数不足，至少需要 ${rule.minLines} 行`);
    }

    if (Number.isInteger(rule.minBytes) && Buffer.byteLength(content, 'utf8') < rule.minBytes) {
      issues.push(`${rule.path} 内容过短，至少需要 ${rule.minBytes} 字节`);
    }

    const requiredSections = normalizeStringArray(rule.requiredSections);
    const missingSections = requiredSections.filter(section => !content.includes(section));
    if (missingSections.length > 0) {
      issues.push(`${rule.path} 缺少必需章节：${missingSections.join('、')}`);
    }

    const requiredPatterns = normalizeStringArray(rule.requiredPatterns);
    const missingPatterns = requiredPatterns.filter(pattern => {
      const regex = new RegExp(pattern, 'i');
      return !regex.test(content);
    });
    if (missingPatterns.length > 0) {
      issues.push(`${rule.path} 缺少必需内容模式：${missingPatterns.join('、')}`);
    }
  });

  if (stage.id === 'prototype') {
    const prototypeResult = verifyPrototype(cwd);
    prototypeResult.issues.forEach(issue => {
      if (!issues.includes(issue)) {
        issues.push(issue);
      }
    });
  }

  return issues;
}

function getMissingChecks(state, checks) {
  const stage = getStage(state.currentStage);
  if (!stage) {
    return [];
  }

  const currentChecks = new Set(Array.isArray(checks) ? checks : []);
  return stage.requiredChecks.filter(check => !currentChecks.has(check));
}

function getInvalidCheckEvidence(state, checks, cwd = process.cwd()) {
  const stage = getStage(state.currentStage);
  if (!stage || stage.id !== 'development') {
    return [];
  }

  const currentChecks = new Set(Array.isArray(checks) ? checks : []);
  if (currentChecks.size === 0) {
    return [];
  }

  const reportPath = path.resolve(cwd, 'docs/test-report.md');
  const structuredReportPath = path.resolve(cwd, 'docs/test-report.json');
  const testContractPath = path.resolve(cwd, '.workflow/test-contract.json');
  const previewDeployPath = path.resolve(cwd, '.workflow/preview-deploy.json');
  if (!fs.existsSync(reportPath)) {
    return ['缺少 docs/test-report.md'];
  }
  if (!fs.existsSync(structuredReportPath)) {
    return ['缺少 docs/test-report.json'];
  }
  if (!fs.existsSync(testContractPath)) {
    return ['缺少 .workflow/test-contract.json'];
  }
  if (!fs.existsSync(previewDeployPath)) {
    return ['缺少 .workflow/preview-deploy.json'];
  }

  const report = fs.readFileSync(reportPath, 'utf8');
  const structuredReport = readJsonFileSafe(structuredReportPath);
  const testContract = readJsonFileSafe(testContractPath);
  const previewDeploy = readJsonFileSafe(previewDeployPath);
  const issues = [];

  if (!report.includes('# 测试报告')) {
    issues.push('docs/test-report.md 不是有效的测试报告');
  }

  if (!report.includes('- 最终结论：通过')) {
    issues.push('测试报告未显示最终结论为通过');
  }

  if (!report.includes('## 验证等级')) {
    issues.push('测试报告缺少验证等级摘要');
  }

  if (currentChecks.has('lint') && !/^### \d+\. 静态检查$/m.test(report)) {
    issues.push('测试报告缺少静态检查执行记录');
  }

  if (currentChecks.has('review') && !/^### \d+\. 代码审核$/m.test(report)) {
    issues.push('测试报告缺少代码审核执行记录');
  }

  if (currentChecks.has('build') && !/^### \d+\. 构建检查$/m.test(report)) {
    issues.push('测试报告缺少构建检查执行记录');
  }

  if (currentChecks.has('test')) {
    const requiredTestSections = ['单元测试', '集成测试', 'E2E 测试'];
    const missingTestSections = requiredTestSections.filter(label => {
      const section = report.match(new RegExp(`^### \\d+\\. ${escapeRegex(label)}$([\\s\\S]*?)(?=^### \\d+\\. |(?![\\s\\S]))`, 'm'));
      return !section || !section[1].includes('- 执行结果：通过');
    });

    if (missingTestSections.length > 0) {
      issues.push(`测试报告缺少必要测试通过记录：${missingTestSections.join('、')}`);
    }

    issues.push(...validateTestContract(testContract));
    issues.push(...validateStructuredTestReport(structuredReport, testContract));
  }

  if (currentChecks.has('review')) {
    const codeReviewPath = path.resolve(cwd, 'docs/code-review.md');
    if (!fs.existsSync(codeReviewPath)) {
      issues.push('缺少 docs/code-review.md');
    } else {
      const codeReview = fs.readFileSync(codeReviewPath, 'utf8');
      if (!codeReview.includes('# 代码审核报告')) {
        issues.push('docs/code-review.md 不是有效的代码审核报告');
      }
      if (!codeReview.includes('- 审核结论：通过')) {
        issues.push('代码审核报告未显示审核结论为通过');
      }
    }
  }

  if (currentChecks.has('build')) {
    issues.push(...validatePreviewDeployReport(previewDeploy));
  }

  return issues;
}

function buildAwaitingApprovalMessage(state) {
  const stage = getStage(state.currentStage);
  if (!stage) {
    return '当前阶段未知，请检查 .workflow/state.json。';
  }

  const summary = state.pendingApproval && state.pendingApproval.summary
    ? `阶段摘要：${state.pendingApproval.summary}`
    : '阶段摘要：未提供';

  const checks = state.pendingApproval && Array.isArray(state.pendingApproval.checks) && state.pendingApproval.checks.length > 0
    ? `检查结果：${state.pendingApproval.checks.join(', ')}`
    : '';

  const verification = state.pendingApproval && state.pendingApproval.verification && state.pendingApproval.verification.tier
    ? `验证等级：${state.pendingApproval.verification.tier}（${state.pendingApproval.verification.reason}）`
    : '';

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🛑 当前处于等待确认：${stage.label}`,
    summary,
    checks,
    verification,
    '',
    '用户可回复：',
    '  确认 / approve / 继续 / ok',
    '  调整 / 修改 / 不对 / 再改',
    '',
    '确认后执行：node scripts/workflow/gate.js confirm',
    '拒绝后执行：node scripts/workflow/gate.js reject "反馈内容"',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].filter(Boolean).join('\n');
}

function buildReadyHint(state) {
  const stage = getStage(state.currentStage);
  if (!stage || stage.id === 'done') {
    return '当前无可确认阶段。';
  }

  const checkHint = stage.requiredChecks.length > 0
    ? ` --checks ${stage.requiredChecks.join(',')}`
    : '';

  const stageCommandHint = stage.id === 'requirements_analysis'
    ? '需求阶段先执行 /brainstorming；需求完成后切换到 /writing-plans。'
    : stage.id === 'development'
      ? '执行实现时使用 /executing-plans。'
      : '';
  const testHint = stage.id === 'development'
    ? '开发阶段先执行：npm run test:all'
    : '';
  const requirementHint = stage.id === 'requirements_analysis'
    ? '需求阶段建议先参考：.workflow/requirement-interview-template.md'
    : '';
  const memoryHint = '可选记录：node scripts/workflow/gate.js note decision|issue|stage "内容"';

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `ℹ️ 当前阶段：${stage.label}`,
    stageCommandHint,
    requirementHint,
    testHint,
    memoryHint,
    '如果当前阶段已经完成，请执行：',
    `node scripts/workflow/gate.js ready --summary "阶段完成"${checkHint}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].filter(Boolean).join('\n');
}

function detectBlockedCommand(command, state) {
  const text = String(command || '').trim();
  if (!text) {
    return null;
  }

  for (const entry of ALWAYS_BLOCKED_COMMANDS) {
    if (entry.pattern.test(text)) {
      return entry.reason;
    }
  }

  if (!['delivery', 'done'].includes(state.currentStage)) {
    for (const entry of DELIVERY_ONLY_COMMANDS) {
      if (entry.pattern.test(text)) {
        return entry.reason;
      }
    }
  }

  const writeTargets = extractShellWriteTargets(text)
    .map(target => normalizeRelativePath(target))
    .filter(Boolean);
  if (writeTargets.length > 0) {
    const stage = getStage(state.currentStage);
    const deniedWrites = getDeniedWrites(state);
    const allowedWrites = getAllowedWrites(state);

    for (const relativePath of writeTargets) {
      if (deniedWrites.some(pattern => matchesPattern(relativePath, pattern))) {
        return `${stage ? stage.label : state.currentStage} 不允许通过 Bash 写入 ${relativePath}。请留在当前阶段允许的目录内。`;
      }

      if (!allowedWrites.some(pattern => matchesPattern(relativePath, pattern))) {
        return `${stage ? stage.label : state.currentStage} 不允许通过 Bash 写入 ${relativePath}。如确有必要，请把额外路径加入 .workflow/state.json 的 customAllowedPaths。`;
      }
    }
  }

  return null;
}

module.exports = {
  DEFAULT_DELIVERABLE_CONTRACT,
  STAGES,
  buildAwaitingApprovalMessage,
  buildReadyHint,
  detectBlockedCommand,
  getAllowedWrites,
  getDeniedWrites,
  getInvalidCheckEvidence,
  getInvalidDeliverables,
  getMissingChecks,
  getMissingFiles,
  getStage,
  matchesPattern,
  normalizeRelativePath,
  readDeliverableContract,
  validatePreviewDeployReport,
};
