#!/usr/bin/env node
/**
 * scripts/hooks/workflow-stage-guard.js
 * PreToolUse Hook — 阶段目录守卫
 *
 * 根据当前阶段，阻止 Claude 向不该写的目录写文件。
 * Claude Code Hook 协议：
 *   - 从 stdin 读取 JSON 事件
 *   - 向 stdout 输出 JSON 响应
 *   - exit 0 = 允许, exit 2 = 阻止并显示消息
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(".workflow/state.json");

// ── 阶段路径规则 ──────────────────────────────────────────────────────────────
// 每个阶段允许和禁止写入的路径前缀
const STAGE_RULES = {
  requirements_analysis: {
    allowed: ["docs/requirement", "docs/", ".workflow/"],
    denied: ["src/", "prototype/", "dist/", "release/"],
    denyMessage: "🛑 [需求分析阶段] 当前不允许写入 {path}。\n请先完成 docs/requirement.md，经用户确认后再继续。",
  },
  waiting_requirement_confirmation: {
    allowed: ["docs/requirement", ".workflow/"],
    denied: ["src/", "prototype/", "dist/"],
    denyMessage: "🛑 [等待需求确认] 请用户先确认需求（回复 1），再进行后续开发。",
  },
  prototype: {
    allowed: ["prototype/", "docs/prototype", "docs/", ".workflow/"],
    denied: ["src/", "dist/", "release/"],
    denyMessage: "🛑 [原型阶段] 当前不允许写入 src/。\n请先完成原型并获得用户确认，再进入正式开发。",
  },
  waiting_prototype_confirmation: {
    allowed: ["prototype/", "docs/prototype", ".workflow/"],
    denied: ["src/", "dist/"],
    denyMessage: "🛑 [等待原型确认] 请用户先确认原型（回复 1），再进入开发阶段。",
  },
  development: {
    allowed: ["src/", "tests/", "docs/", ".workflow/", "scripts/"],
    denied: ["dist/", "release/"],
    denyMessage: "🛑 [开发阶段] 当前不允许执行发布操作。\n请完成开发测试后，经用户确认再进行交付。",
  },
  waiting_uat: {
    allowed: ["docs/uat-feedback", "src/", "tests/", ".workflow/"],
    denied: ["dist/", "release/"],
    denyMessage: "🛑 [等待用户验收] 请用户完成验收测试（回复 1 或 2），再继续操作。",
  },
  delivery: {
    allowed: ["docs/delivery", "dist/", "release/", ".workflow/"],
    denied: [],
    denyMessage: "",
  },
  done: {
    allowed: ["*"],
    denied: [],
    denyMessage: "",
  },
};

// 危险的 Bash 命令关键词（在等待确认阶段拦截）
const DANGEROUS_BASH_PATTERNS = [
  /git push(?!\s+--dry)/,
  /npm publish/,
  /yarn publish/,
  /docker push/,
  /rm -rf/,
  /git reset --hard/,
  /git push --force/,
];

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function normalizeFilePath(filePath) {
  // 去掉绝对路径前缀，转为相对路径
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    filePath = filePath.slice(cwd.length).replace(/^\//, "");
  }
  return filePath;
}

function isDenied(filePath, rules) {
  const normalized = normalizeFilePath(filePath);
  // 检查是否命中 denied 列表
  for (const denied of rules.denied) {
    if (normalized.startsWith(denied) || normalized === denied.replace(/\/$/, "")) {
      return true;
    }
  }
  return false;
}

// ── 主逻辑 ────────────────────────────────────────────────────────────────────
let inputData = "";
process.stdin.on("data", (chunk) => (inputData += chunk));
process.stdin.on("end", () => {
  let event;
  try {
    event = JSON.parse(inputData);
  } catch {
    // 无法解析直接放行
    process.exit(0);
  }

  const state = readState();
  if (!state) {
    // 未初始化工作流，放行（不强制要求所有项目都用这套流程）
    process.exit(0);
  }

  const rules = STAGE_RULES[state.currentStage];
  if (!rules) {
    process.exit(0);
  }

  const toolName = event.tool_name || event.toolName || "";
  const toolInput = event.tool_input || event.toolInput || {};

  // ── 检查文件写入操作 ──────────────────────────────────────────────────────
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) {
    const filePath = toolInput.file_path || toolInput.path || toolInput.notebook_path || "";
    if (filePath && isDenied(filePath, rules)) {
      const message = rules.denyMessage.replace("{path}", normalizeFilePath(filePath));
      console.log(
        JSON.stringify({
          decision: "block",
          reason: message,
        })
      );
      process.exit(2);
    }
  }

  // ── 检查危险 Bash 命令（仅在等待确认阶段）──────────────────────────────────
  if (toolName === "Bash" && state.currentStage.startsWith("waiting_")) {
    const command = toolInput.command || "";
    for (const pattern of DANGEROUS_BASH_PATTERNS) {
      if (pattern.test(command)) {
        console.log(
          JSON.stringify({
            decision: "block",
            reason: `🛑 [${state.currentStage}] 检测到危险命令：${command}\n当前处于等待确认阶段，请用户先确认后再执行发布/部署操作。`,
          })
        );
        process.exit(2);
      }
    }
  }

  // 默认放行
  process.exit(0);
});
