#!/usr/bin/env node
/**
 * scripts/hooks/workflow-stage-sync.js
 * Stop Hook — 阶段同步与产物检查
 *
 * 在每次 Claude 会话结束时：
 * 1. 检查当前阶段必要产物是否齐全
 * 2. 如果齐全，自动输出门控提示，提醒用户确认
 * 3. 记录审计日志
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(".workflow/state.json");
const AUDIT_LOG = path.resolve(".workflow/audit.log");

// 各阶段的产物检查配置
const STAGE_DELIVERABLES = {
  requirements_analysis: {
    files: ["docs/requirement.md"],
    readyMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 需求文档已生成：docs/requirement.md

📋 请审阅需求文档后告诉 Claude：
   1️⃣  确认，继续原型阶段
   2️⃣  需要调整需求

或运行：node scripts/workflow/gate.js advance
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  prototype: {
    files: ["docs/prototype.md"],
    readyMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 原型已生成：prototype/ + docs/prototype.md

🎨 请在浏览器查看原型后告诉 Claude：
   1️⃣  确认，进入开发阶段
   2️⃣  需要调整原型

或运行：node scripts/workflow/gate.js advance
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  development: {
    files: [],
    readyMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 开发阶段工作已完成

🧪 请运行测试并验收后告诉 Claude：
   1️⃣  测试通过，进入交付阶段
   2️⃣  发现问题，继续修复

或运行：node scripts/workflow/gate.js advance
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  delivery: {
    files: ["docs/delivery.md"],
    readyMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 交付文档已生成：docs/delivery.md
项目交付完成！🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
};

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function appendAudit(action, detail) {
  try {
    fs.mkdirSync(".workflow", { recursive: true });
    const line = `[${new Date().toISOString()}] ${action}: ${detail}\n`;
    fs.appendFileSync(AUDIT_LOG, line);
  } catch {}
}

// ── 主逻辑 ────────────────────────────────────────────────────────────────────
let inputData = "";
process.stdin.on("data", (chunk) => (inputData += chunk));
process.stdin.on("end", () => {
  const state = readState();
  if (!state) {
    process.exit(0);
  }

  const config = STAGE_DELIVERABLES[state.currentStage];
  if (!config) {
    process.exit(0);
  }

  // 检查必要产物
  const missing = config.files.filter((f) => !fs.existsSync(f));
  if (missing.length === 0 && config.files.length > 0) {
    // 产物齐全，输出门控提示
    appendAudit("DELIVERABLES_READY", `阶段 ${state.currentStage} 产物已就绪`);
    // 通过 stderr 输出提示（Claude Code 会显示 hook stderr）
    process.stderr.write(config.readyMessage + "\n");
  } else if (missing.length > 0) {
    appendAudit("DELIVERABLES_MISSING", `阶段 ${state.currentStage} 缺少: ${missing.join(", ")}`);
    process.stderr.write(`\n⚠️  当前阶段缺少以下产物：\n  ${missing.join("\n  ")}\n`);
  } else if (config.files.length === 0 && config.readyMessage) {
    // 无文件检查，但有就绪消息（如 development 阶段）
    process.stderr.write(config.readyMessage + "\n");
  }

  appendAudit("SESSION_END", `阶段: ${state.currentStage}`);
  process.exit(0);
});
