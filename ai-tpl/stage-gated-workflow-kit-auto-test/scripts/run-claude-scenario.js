#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { RN_TODO_JAVA_SCENARIO, PLANE_SHOOTER_WEB_SCENARIO } = require('../tests/shared/sdk-scenarios');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const GLOBAL_RUNTIME_PATH = path.join(os.homedir(), '.claude.json');
const PROJECT_SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const SCENARIOS = new Map([
  [RN_TODO_JAVA_SCENARIO.id, RN_TODO_JAVA_SCENARIO],
  [PLANE_SHOOTER_WEB_SCENARIO.id, PLANE_SHOOTER_WEB_SCENARIO],
]);

function getRunStatePath(workspace) {
  return path.join(workspace, '.workflow', 'claude-cli-run-state.json');
}

function getRunSummaryJsonPath(workspace) {
  return path.join(workspace, '.workflow', 'claude-cli-run-summary.json');
}

function getRunSummaryMarkdownPath(workspace) {
  return path.join(workspace, '.workflow', 'claude-cli-run-summary.md');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readState(workspace) {
  return readJson(path.join(workspace, '.workflow', 'state.json'));
}

function readRunState(workspace) {
  const targetPath = getRunStatePath(workspace);
  if (!fs.existsSync(targetPath)) {
    return null;
  }
  return readJson(targetPath);
}

function writeRunState(workspace, runState) {
  const targetPath = getRunStatePath(workspace);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify({
    ...runState,
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');
}

function resolveScenario(scenarioId) {
  const scenario = SCENARIOS.get(scenarioId);
  if (!scenario) {
    throw new Error(`未知场景：${scenarioId}`);
  }
  return scenario;
}

function assertCliAuthReady() {
  if (!fs.existsSync(GLOBAL_RUNTIME_PATH)) {
    throw new Error('未检测到 ~/.claude.json，请先完成 Claude CLI 登录。');
  }
}

function readProjectClaudeEnv() {
  if (!fs.existsSync(PROJECT_SETTINGS_PATH)) {
    return {};
  }

  const settings = readJson(PROJECT_SETTINGS_PATH);
  return settings.env || {};
}

function runGate(workspace, args) {
  execFileSync('node', ['scripts/workflow/gate.js', ...args], {
    cwd: workspace,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runClaude(workspace, prompt, sessionId) {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--permission-mode',
    'bypassPermissions',
    '--dangerously-skip-permissions',
  ];
  if (sessionId) {
    args.unshift('--resume', sessionId);
  }

  const result = spawnSync('claude', args, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      ...readProjectClaudeEnv(),
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error([
      `Claude CLI 退出码：${result.status}`,
      result.stderr ? `stderr:\n${result.stderr.trim()}` : '',
      result.stdout ? `stdout:\n${result.stdout.trim()}` : '',
    ].filter(Boolean).join('\n\n'));
  }

  const raw = result.stdout;
  const parsed = JSON.parse(raw.trim());
  if (parsed.type !== 'result' || parsed.is_error) {
    throw new Error(parsed.result || 'Claude CLI 返回错误');
  }

  return {
    assistant: String(parsed.result || '').trim(),
    sessionId: parsed.session_id || '',
    raw: parsed,
  };
}

function ensureScenarioSeed(workspace, scenario) {
  fs.mkdirSync(path.join(workspace, '.workflow'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.workflow', 'test-scenario.md'), scenario.testScenario, 'utf8');
}

function formatTranscriptBlock(transcript) {
  if (transcript.length === 0) {
    return '当前还没有历史对话。';
  }

  return transcript.map((item, index) => {
    return [
      `## 第 ${index + 1} 轮`,
      '',
      `**用户**：${item.user}`,
      '',
      `**Claude Code**：${item.assistant}`,
      '',
    ].join('\n');
  }).join('\n');
}

function buildStageSpecificPrompt(round) {
  switch (round.stageId) {
    case 'requirements_analysis':
      return 'docs/requirement.md 至少包含：## 项目概述、## 功能需求、## 用户使用场景、## 验收范围、## 非目标、## 需求澄清。';
    case 'prototype':
      return [
        'docs/prototype.md 至少包含：## 页面清单、## 关键交互、## 验证方式。',
        'prototype/index.html 必须包含 button、input、form、select、textarea 中至少一种可交互元素。',
      ].join('\n');
    case 'development':
      return [
        '必须执行 node scripts/run-all-tests.js，让 docs/test-report.md 出现 ## 验证等级，让 docs/test-report.json 包含 verification 字段。',
        'docs/code-review.md 应保留 review:code 生成的 ## 概览、## 审核标准、## 审核摘要。',
      ].join('\n');
    case 'delivery':
      return 'docs/delivery.md 至少包含：## 交付物、## 启动方式、## 已知风险。';
    default:
      return '';
  }
}

function buildPrompt(scenario, round, transcript, workspace) {
  const state = readState(workspace);
  const requiredPaths = round.requiredPaths.length > 0
    ? `本轮必须生成或更新以下阶段产物：${round.requiredPaths.join('、')}。`
    : '';
  const patternRequirements = getPatternRequirementsForRound(scenario, round).map(requirement => {
    return `${requirement.path} 必须包含文本：${requirement.pattern}`;
  });
  const requiredPatterns = patternRequirements.length > 0
    ? `本轮固定内容要求：\n${patternRequirements.join('\n')}`
    : '';
  const prototypeRules = round.stageId === 'prototype'
    ? [
        '原型阶段只需要最小可交付原型：一个 docs/prototype.md 和一个 prototype/index.html。',
        'prototype/index.html 必须是单文件静态页面，直接用原生 HTML/CSS/少量内联 JS 即可，不要引入任何依赖，不要创建额外脚手架。',
        '原型只需体现核心流程和关键反馈：输入、主按钮、成功/失败提示。',
        '不要在原型阶段生成 src、tests、package.json 改造或任何开发阶段资产。',
      ].join('\n\n')
    : '';
  const developmentRules = round.stageId === 'development'
    ? [
        '开发阶段必须在项目根目录执行 `node scripts/run-all-tests.js`，不要手写自定义格式的 docs/test-report.md。',
        '开发阶段的 docs/test-report.md 和 docs/code-review.md 必须以模板脚本生成结果为准，报告中需要包含 `- 最终结论：通过`、`### 1. 静态检查`、`### 2. 单元测试`、`### 3. 集成测试`、`### 4. E2E 测试`、`### 5. 代码审核`、`### 6. 构建检查`。',
        '如果某些测试依赖需要你补齐，请先补齐项目结构和测试脚本，再重新执行 `node scripts/run-all-tests.js`，直到模板门禁可通过。',
        '不要生成 Gradle、Maven、Spring Boot、Expo、Xcode、Android Studio、Pod install、npm install 大型依赖树等重型工程。',
        '后端若需要 Java 语义，只保留轻量 Java 接口契约文件；真正可执行闭环请用 Node 脚本和 node:test 完成。',
        '移动端若需要 React Native 语义，只保留 src/app/android 与 src/app/ios 下的轻量文件和 README，不要扩展成完整 RN 工程。',
        '优先生成最小可验证实现：package.json 脚本、src/backend/mock、src/shared、按项目类型选择 src/web 或 src/miniprogram、tests/unit、tests/integration、tests/e2e。',
      ].join('\n\n')
    : '';

  return [
    '阅读当前项目中的 CLAUDE.md、skills/stage-gated-delivery/SKILL.md、.workflow/state.json、.workflow/test-scenario.md。',
    `当前阶段是 ${state.currentStage}，本轮只允许完成 ${round.stageId}，不要进入下一阶段，不要自行调用 gate.js。`,
    '你正在参与一个真实 CLI 回归测试，不要伪造结论，不要只写占位文件。',
    '如果进入开发阶段，必须补齐可执行脚本并实际运行可行测试，然后生成 docs/test-report.md 和 docs/code-review.md。',
    '开发阶段源码结构必须遵守：src/app/android、src/app/ios、src/web、src/miniprogram、src/backend、tests。',
    '如果项目类型是小程序，前端正式源码必须放在 src/miniprogram，不要放在 src/web。',
    'Android、iOS 若暂时无法实现完整原生代码，也必须保留目录并用 README 说明真实用途，不要把正式实现留在 prototype/。',
    '请让产物尽量像真实项目，不要只输出空文档。',
    '必须实际使用工具创建或修改本轮产物文件，禁止只回复说明文字。回复前请确认本轮必需产物路径已经存在。',
    requiredPaths,
    requiredPatterns,
    buildStageSpecificPrompt(round),
    prototypeRules,
    developmentRules,
    '之前的对话如下：',
    formatTranscriptBlock(transcript),
    '当前用户消息如下：',
    round.userMessage,
    '完成当前阶段产物后，用一句话说明本阶段已完成并等待确认。',
  ].join('\n\n');
}

function assertRequiredPaths(workspace, requiredPaths) {
  const missing = getMissingRequiredPaths(workspace, requiredPaths);
  if (missing.length > 0) {
    throw new Error(`缺少阶段产物：${missing.join(', ')}`);
  }
}

function getMissingRequiredPaths(workspace, requiredPaths) {
  return requiredPaths.filter(relativePath => !fs.existsSync(path.join(workspace, relativePath)));
}

function getPatternRequirementsForRound(scenario, round) {
  const roundPaths = new Set(round.requiredPaths);
  return (scenario.assertions.filePatterns || []).filter(requirement => roundPaths.has(requirement.path));
}

function getMissingPatternRequirements(workspace, scenario, round) {
  return getPatternRequirementsForRound(scenario, round).filter(requirement => {
    const filePath = path.join(workspace, requirement.path);
    if (!fs.existsSync(filePath)) {
      return true;
    }
    return !fs.readFileSync(filePath, 'utf8').includes(requirement.pattern);
  });
}

function buildRepairPrompt(round, missingPaths) {
  return [
    `当前仍处于 ${round.stageId} 阶段，上一次回复后缺少必需产物：${missingPaths.join('、')}。`,
    '请不要推进阶段，不要调用 gate.js。',
    '请立即实际创建或修正这些文件/目录，并保持已完成内容不被回退。',
    '完成后用一句话说明已补齐缺失产物并等待确认。',
  ].join('\n\n');
}

function buildPatternRepairPrompt(round, missingRequirements) {
  return [
    `当前仍处于 ${round.stageId} 阶段，以下固定内容要求还未满足：`,
    ...missingRequirements.map(requirement => `- ${requirement.path} 必须包含文本：${requirement.pattern}`),
    '请不要推进阶段，不要调用 gate.js。',
    '请立即实际修改对应文件，保留已有实现，并让这些文本出现在对应文件中。',
    '完成后用一句话说明已补齐固定内容并等待确认。',
  ].join('\n\n');
}

function writeTranscriptArtifacts(workspace, scenario, transcript) {
  const docsDir = path.join(workspace, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  fs.writeFileSync(path.join(docsDir, 'claude-code-dialogue.md'), [
    `# ${scenario.projectName} 对话记录`,
    '',
    '以下内容来自 stage-gated-workflow-kit-auto-test 通过 Claude CLI 驱动的真实阶段回归。',
    '',
    formatTranscriptBlock(transcript),
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(docsDir, 'agent-session.md'), [
    `# ${scenario.projectName} Agent 过程记录`,
    '',
    '## 使用方式',
    '',
    '- 通过 Claude CLI 按阶段驱动真实对话。',
    '- 每轮在模板约束下生成当前阶段产物，并在 ready/confirm 后推进。',
    '- 本文件由自动化测试根据真实对话记录整理生成。',
    '',
    '## Agent 执行轨迹',
    '',
    ...transcript.map((item, index) => `${index + 1}. ${item.stageId}：${item.user}`),
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(
    path.join(workspace, '.workflow', 'claude-cli-run.json'),
    JSON.stringify(transcript, null, 2) + '\n',
    'utf8'
  );
}

function writeRunSummary(workspace, summary) {
  fs.writeFileSync(getRunSummaryJsonPath(workspace), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  fs.writeFileSync(getRunSummaryMarkdownPath(workspace), [
    '# Claude CLI 回归摘要',
    '',
    `- 场景：${summary.scenarioId}`,
    `- 状态：${summary.status}`,
    `- 起始时间：${summary.startedAt}`,
    `- 更新时间：${summary.updatedAt}`,
    `- 已完成轮次：${summary.completedRounds}`,
    `- 最后会话：${summary.sessionId || '无'}`,
    summary.error ? `- 错误：${summary.error}` : '- 错误：无',
    '',
  ].join('\n'), 'utf8');
}

function createInitialRunState(workspace, scenario) {
  runGate(workspace, ['init', scenario.projectName]);
  ensureScenarioSeed(workspace, scenario);

  const runState = {
    scenarioId: scenario.id,
    workspace,
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCompletedRoundIndex: -1,
    nextRoundIndex: 0,
    sessionId: '',
    transcript: [],
    resumed: false,
  };
  writeRunState(workspace, runState);
  return runState;
}

function prepareRunState(workspace, scenario) {
  const existing = readRunState(workspace);
  if (existing && existing.scenarioId === scenario.id && existing.status === 'running') {
    return {
      ...existing,
      resumed: true,
    };
  }

  return createInitialRunState(workspace, scenario);
}

function runScenario(scenarioId, workspace) {
  const scenario = resolveScenario(scenarioId);
  assertCliAuthReady();

  const runState = prepareRunState(workspace, scenario);
  const transcript = Array.isArray(runState.transcript) ? runState.transcript : [];
  let lastSessionId = runState.sessionId || '';
  const startRoundIndex = Number.isInteger(runState.nextRoundIndex) ? runState.nextRoundIndex : 0;

  for (let index = startRoundIndex; index < scenario.rounds.length; index += 1) {
    const round = scenario.rounds[index];
    const state = readState(workspace);
    if (state.currentStage !== round.stageId) {
      throw new Error(`阶段错位：期望 ${round.stageId}，实际 ${state.currentStage}`);
    }
    if (state.awaitingApproval) {
      throw new Error(`阶段 ${state.currentStage} 仍在等待确认，无法继续`);
    }

    let result = runClaude(workspace, buildPrompt(scenario, round, transcript, workspace), lastSessionId);
    lastSessionId = result.sessionId || lastSessionId;

    let missingPaths = getMissingRequiredPaths(workspace, round.requiredPaths);
    if (missingPaths.length > 0) {
      result = runClaude(workspace, buildRepairPrompt(round, missingPaths), lastSessionId);
      lastSessionId = result.sessionId || lastSessionId;
      missingPaths = getMissingRequiredPaths(workspace, round.requiredPaths);
    }
    let missingPatterns = getMissingPatternRequirements(workspace, scenario, round);
    if (missingPaths.length === 0 && missingPatterns.length > 0) {
      result = runClaude(workspace, buildPatternRepairPrompt(round, missingPatterns), lastSessionId);
      lastSessionId = result.sessionId || lastSessionId;
      missingPatterns = getMissingPatternRequirements(workspace, scenario, round);
    }

    transcript.push({
      stageId: round.stageId,
      user: round.userMessage,
      assistant: result.assistant,
      sessionId: result.sessionId || '',
      raw: result.raw,
    });

    assertRequiredPaths(workspace, round.requiredPaths);
    if (missingPatterns.length > 0) {
      throw new Error(`阶段产物内容不符合要求：${missingPatterns.map(requirement => `${requirement.path} 缺少 ${requirement.pattern}`).join(', ')}`);
    }

    const afterStage = readState(workspace);
    if (!afterStage.awaitingApproval) {
      const readyArgs = ['ready', '--summary', round.summary];
      if (round.checks.length > 0) {
        readyArgs.push('--checks', round.checks.join(','));
      }
      runGate(workspace, readyArgs);
    } else if (!afterStage.pendingApproval || afterStage.pendingApproval.stageId !== round.stageId) {
      throw new Error(`${round.stageId} 的 pendingApproval 不正确`);
    }

    runGate(workspace, ['confirm']);

    runState.lastCompletedRoundIndex = index;
    runState.nextRoundIndex = index + 1;
    runState.sessionId = lastSessionId;
    runState.transcript = transcript;
    writeRunState(workspace, runState);
  }

  writeTranscriptArtifacts(workspace, scenario, transcript);
  const summary = {
    scenarioId: scenario.id,
    workspace,
    status: 'completed',
    startedAt: runState.startedAt,
    updatedAt: new Date().toISOString(),
    completedRounds: transcript.length,
    sessionId: lastSessionId,
    resumed: Boolean(runState.resumed),
    error: '',
  };
  writeRunSummary(workspace, summary);
  writeRunState(workspace, {
    ...runState,
    status: 'completed',
    nextRoundIndex: scenario.rounds.length,
    sessionId: lastSessionId,
    transcript,
  });

  return {
    scenarioId: scenario.id,
    workspace,
    finalState: readState(workspace),
    transcriptRounds: transcript.length,
    sessionId: lastSessionId,
    resumed: Boolean(runState.resumed),
    runStatePath: getRunStatePath(workspace),
    runSummaryPath: getRunSummaryJsonPath(workspace),
  };
}

function main() {
  const scenarioId = process.argv[2];
  const workspace = process.argv[3];

  if (!scenarioId || !workspace) {
    throw new Error('用法：node scripts/run-claude-scenario.js <scenario-id> <workspace>');
  }

  try {
    const result = runScenario(scenarioId, workspace);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    const runState = readRunState(workspace);
    if (runState) {
      const summary = {
        scenarioId,
        workspace,
        status: 'failed',
        startedAt: runState.startedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedRounds: Array.isArray(runState.transcript) ? runState.transcript.length : 0,
        sessionId: runState.sessionId || '',
        resumed: Boolean(runState.resumed),
        error: error.message,
      };
      writeRunSummary(workspace, summary);
      writeRunState(workspace, {
        ...runState,
        status: 'failed',
        error: error.message,
      });
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`Claude CLI 场景执行失败：${error.message}`);
  process.exit(1);
}
