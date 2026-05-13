#!/usr/bin/env node
/**
 * scripts/workflow/gate.js
 * 阶段门控脚本 — 查询当前状态、推进阶段、记录审批
 *
 * 用法：
 *   node scripts/workflow/gate.js status
 *   node scripts/workflow/gate.js advance
 *   node scripts/workflow/gate.js reject "需要修改需求文档"
 *   node scripts/workflow/gate.js init "项目名称"
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(".workflow/state.json");
const AUDIT_LOG = path.resolve(".workflow/audit.log");

// ── 阶段定义 ────────────────────────────────────────────────────────────────
const STAGES = [
  {
    id: "requirements_analysis",
    label: "📋 阶段 1：需求分析",
    description: "分析需求，产出 docs/requirement.md",
    requiredFiles: ["docs/requirement.md"],
    allowedPaths: ["docs/requirement.md", "docs/"],
    deniedPaths: ["src/", "prototype/"],
    waitingStage: "waiting_requirement_confirmation",
    confirmField: "requirementConfirmed",
    gateMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 阶段门控：需求分析完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
请审阅 docs/requirement.md 后确认：

  1️⃣  确认，进入原型阶段
  2️⃣  需要调整，继续修改

回复数字即可。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  {
    id: "waiting_requirement_confirmation",
    label: "⏳ 等待需求确认",
    description: "等待用户确认需求文档",
    requiredFiles: [],
    allowedPaths: ["docs/requirement.md"],
    deniedPaths: ["src/", "prototype/"],
    waitingStage: null,
    confirmField: null,
    gateMessage: "等待需求确认中，请回复 1（确认）或 2（需要修改）。",
  },
  {
    id: "prototype",
    label: "🎨 阶段 2：原型",
    description: "制作可视原型，产出 prototype/ 和 docs/prototype.md",
    requiredFiles: ["docs/prototype.md"],
    allowedPaths: ["prototype/", "docs/prototype.md", "docs/"],
    deniedPaths: ["src/"],
    waitingStage: "waiting_prototype_confirmation",
    confirmField: "prototypeConfirmed",
    gateMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 阶段门控：原型完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
请在浏览器中查看 prototype/ 目录后确认：

  1️⃣  确认，进入开发阶段
  2️⃣  需要调整原型

回复数字即可。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  {
    id: "waiting_prototype_confirmation",
    label: "⏳ 等待原型确认",
    description: "等待用户确认原型",
    requiredFiles: [],
    allowedPaths: ["prototype/", "docs/prototype.md"],
    deniedPaths: ["src/"],
    waitingStage: null,
    confirmField: null,
    gateMessage: "等待原型确认中，请回复 1（确认）或 2（需要修改）。",
  },
  {
    id: "development",
    label: "⚙️  阶段 3：开发与测试",
    description: "正式开发 + 自动化测试，产出 src/ 下完整代码",
    requiredFiles: [],
    allowedPaths: ["src/", "tests/", "docs/"],
    deniedPaths: [],
    waitingStage: "waiting_uat",
    confirmField: "devTestConfirmed",
    gateMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 阶段门控：开发与测试完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
请查看测试报告并进行用户验收测试：

  1️⃣  确认通过，进入交付阶段
  2️⃣  发现问题，需要修复

回复数字即可。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  {
    id: "waiting_uat",
    label: "⏳ 等待用户验收测试",
    description: "等待 UAT 结果",
    requiredFiles: [],
    allowedPaths: ["docs/uat-feedback.md", "src/"],
    deniedPaths: [],
    waitingStage: null,
    confirmField: null,
    gateMessage: "等待用户验收测试，请回复 1（通过）或 2（需要修复）。",
  },
  {
    id: "delivery",
    label: "🚀 阶段 4：交付",
    description: "打包、构建、生成交付文档",
    requiredFiles: ["docs/delivery.md"],
    allowedPaths: ["docs/delivery.md", "dist/", "release/"],
    deniedPaths: [],
    waitingStage: "done",
    confirmField: "uatConfirmed",
    gateMessage: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 交付完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
请查看 docs/delivery.md 确认交付内容。
所有阶段已完成！🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  {
    id: "done",
    label: "✅ 完成",
    description: "项目交付完成",
    requiredFiles: [],
    allowedPaths: ["*"],
    deniedPaths: [],
    waitingStage: null,
    confirmField: null,
    gateMessage: "项目已完成交付。",
  },
];

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error("❌ 状态文件不存在，请先运行: node scripts/workflow/gate.js init <项目名>");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function appendAudit(action, detail) {
  const line = `[${new Date().toISOString()}] ${action}: ${detail}\n`;
  fs.appendFileSync(AUDIT_LOG, line);
}

function getStage(id) {
  return STAGES.find((s) => s.id === id);
}

// ── 命令处理 ──────────────────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "init": {
    const projectName = args[0] || "my-project";
    const initState = {
      projectName,
      currentStage: "requirements_analysis",
      stageHistory: [],
      requirementConfirmed: false,
      prototypeConfirmed: false,
      devTestConfirmed: false,
      uatConfirmed: false,
      approvalMode: "chat",
      lastGateSummary: "",
      pendingFeedback: "",
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(".workflow", { recursive: true });
    writeState(initState);
    appendAudit("INIT", `项目初始化: ${projectName}`);
    console.log(`✅ 项目 "${projectName}" 已初始化，当前阶段：需求分析`);
    break;
  }

  case "status": {
    const state = readState();
    const stage = getStage(state.currentStage);
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 工作流状态：${state.projectName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前阶段：${stage ? stage.label : state.currentStage}
描述：${stage ? stage.description : "-"}

确认状态：
  需求确认：${state.requirementConfirmed ? "✅" : "⏳"}
  原型确认：${state.prototypeConfirmed ? "✅" : "⏳"}
  开发测试：${state.devTestConfirmed ? "✅" : "⏳"}
  用户验收：${state.uatConfirmed ? "✅" : "⏳"}

更新时间：${state.updatedAt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (stage && stage.gateMessage && state.currentStage.startsWith("waiting_")) {
      console.log(stage.gateMessage);
    }
    break;
  }

  case "advance": {
    const state = readState();
    const stage = getStage(state.currentStage);

    if (!stage || !stage.waitingStage) {
      console.log("✅ 已是最终阶段或无法推进。");
      break;
    }

    // 检查必要产物
    const missing = (stage.requiredFiles || []).filter((f) => !fs.existsSync(f));
    if (missing.length > 0) {
      console.error(`❌ 以下产物尚未生成，无法推进：\n  ${missing.join("\n  ")}`);
      process.exit(1);
    }

    // 推进阶段
    const prevStage = state.currentStage;
    state.stageHistory.push({
      stage: prevStage,
      completedAt: new Date().toISOString(),
      approvedBy: "user",
    });

    // 标记当前阶段确认字段
    if (stage.confirmField) {
      state[stage.confirmField] = true;
    }

    state.currentStage = stage.waitingStage;
    writeState(state);
    appendAudit("ADVANCE", `${prevStage} -> ${stage.waitingStage}`);

    const nextStage = getStage(stage.waitingStage);
    console.log(`✅ 阶段推进：${stage.label} -> ${nextStage ? nextStage.label : stage.waitingStage}`);

    if (nextStage && nextStage.gateMessage) {
      console.log(nextStage.gateMessage);
    }
    break;
  }

  case "reject": {
    const reason = args.join(" ") || "需要修改";
    const state = readState();
    state.pendingFeedback = reason;
    writeState(state);
    appendAudit("REJECT", `阶段 ${state.currentStage} 被拒绝: ${reason}`);
    console.log(`🔄 已记录反馈："${reason}"，继续在当前阶段工作。`);
    break;
  }

  case "gate": {
    // 输出阶段门控提示（供 Claude 在阶段末调用）
    const state = readState();
    const stage = getStage(state.currentStage);
    if (stage) {
      console.log(stage.gateMessage || `当前阶段：${stage.label}，等待用户确认。`);
    }
    break;
  }

  default: {
    console.log(`
Claude Code 工作流门控工具

用法：
  node scripts/workflow/gate.js init <项目名>   初始化项目
  node scripts/workflow/gate.js status          查看当前状态
  node scripts/workflow/gate.js advance         推进到下一阶段
  node scripts/workflow/gate.js reject [原因]   拒绝当前阶段，记录反馈
  node scripts/workflow/gate.js gate            输出当前阶段门控提示
`);
  }
}
