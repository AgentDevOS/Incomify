# Claude Code 分阶段确认流程整体解决方案

## 1. 目标

为 Claude Code 建立一套可执行、可拦截、可追踪、可外部审批的分阶段研发流程，覆盖以下链路：

`需求 -> 确认 -> 原型 -> 确认 -> 开发+测试 -> 用户测试 -> 交付`

目标不是只让模型“尽量遵守”，而是做到：

- 有清晰的阶段定义
- 有人工确认门控
- 有目录级和操作级限制
- 有状态可恢复
- 有对话内确认和外部表单确认两种入口
- 能复用 Everything Claude Code 当前项目已有能力

---

## 2. 现有材料综合结论

### 2.1 已有方案的价值

#### `codex-demo/AGENTS.md`

优点：

- 阶段定义清晰
- 目录边界清晰
- 输出契约明确
- 适合做项目级流程制度

不足：

- 主要是文本约束
- 无法真正阻止越阶段写文件或执行命令

#### `codex-demo/workflow.sh`

优点：

- 已经有阶段状态机雏形
- 已经体现“确认后才能进入下一阶段”

不足：

- 依赖 shell 和人工改状态文件
- 与 Claude 运行时没有深度绑定
- 无法拦截直接工具调用
- 文件命名有不一致风险，如 `request.md` 与 `requirement.md`

#### `autosoft/CLAUDE.md`

优点：

- 非技术化沟通风格适合业务用户
- `1/2` 选择非常适合阶段确认
- 强调每阶段必须停下来

不足：

- 仍然属于软约束

#### `autosoft/flow-gate.sh` + `n8n-dev-flow-workflow.json`

优点：

- 已有外部审批通道
- 可以把确认动作从聊天扩展到表单

不足：

- 目前更像通知器，不是完整闭环
- 审批结果还没有统一回写到本地状态机

### 2.2 当前 ECC 仓库可直接复用的能力

当前项目已经具备非常适合承载这套流程的底座：

- Hook 体系：可在 `PreToolUse`、`PostToolUse`、`PermissionRequest`、`TaskCompleted`、`UserPromptSubmit`、`SessionStart`、`Stop` 等节点挂控制逻辑
- Hook 安装合并能力：可把流程控制作为可安装模块分发
- Governance 捕获能力：能记录审批请求、敏感操作、策略违规
- State Store：能记录和查询治理事件、会话状态
- Orchestration 能力：后续可以把阶段内开发扩展为多 worker 协作
- Skills 是主工作流界面：适合把这套流程做成标准技能，而不是只靠命令或文档

结论：

**最佳方案不是单选，而是组合方案。**

---

## 3. 最终推荐方案

推荐采用四层架构：

1. 流程声明层：`AGENTS.md` / `CLAUDE.md`
2. 执行入口层：`skills/` 为主，`commands/` 为兼容
3. 强制门控层：Hooks + 本地状态机
4. 外部审批层：n8n + 表单 + 对话内 `1/2`

其中：

- `AGENTS.md/CLAUDE.md` 负责“告诉 Claude 应该怎么做”
- `skills` 负责“给 Claude 一个标准执行入口”
- `Hooks + 状态机` 负责“阻止 Claude 不该做的事”
- `n8n` 负责“把确认节点扩展成外部审批能力”

---

## 4. 为什么这样选

### 4.1 只靠文档不够

仅使用 `CLAUDE.md` 或 `AGENTS.md`，属于软约束。模型通常会遵守，但不能防止：

- 需求未确认就写 `src/`
- 原型阶段直接进入正式开发
- 未通过 UAT 就提前交付

### 4.2 只靠 Slash Commands 也不够

命令入口可以规范用户操作，但如果 Claude 在会话中直接使用工具修改文件，命令本身不能拦截。

此外，ECC 当前项目本身也强调：

- `skills/` 是主工作流面
- `commands/` 是兼容层

因此不应把核心方案建立在命令上。

### 4.3 Hooks 才是硬门控

只有 Hooks 才能在工具调用前后真正检查：

- 当前阶段是否允许写该目录
- 当前操作是否需要人工审批
- 当前阶段产物是否齐全

### 4.4 SDK 先不做

SDK 方案灵活，但当前目标是“在 Claude Code 现有工程能力里落地”。因此 SDK 适合放在二期或平台化阶段。

---

## 5. 推荐落地架构

### 5.1 项目内目录建议

```text
.workflow/
  state.json
  approvals.json
  audit.log

docs/
  requirement.md
  prototype.md
  uat-feedback.md
  delivery.md

prototype/
  index.html
  ...

src/
  web/
  app/
  web_admin/
  backend/

skills/
  stage-gated-delivery/
    SKILL.md

commands/            # 可选兼容层
  phase1-plan.md
  phase2-prototype.md
  phase3-dev-test.md
  phase4-uat.md
  phase5-delivery.md

scripts/workflow/
  init.js
  status.js
  gate.js
  advance.js
  sync-approval.js

scripts/hooks/
  workflow-stage-guard.js
  workflow-stage-sync.js
  workflow-user-prompt.js
```

---

## 6. 状态机设计

### 6.1 状态文件

建议使用 `.workflow/state.json` 作为唯一真实状态源：

```json
{
  "projectName": "example-project",
  "currentStage": "requirements_analysis",
  "requirementConfirmed": false,
  "prototypeConfirmed": false,
  "uatConfirmed": false,
  "approvalMode": "both",
  "lastGateSummary": "",
  "pendingFeedback": "",
  "updatedAt": ""
}
```

### 6.2 阶段枚举

- `requirements_analysis`
- `waiting_requirement_confirmation`
- `prototype`
- `waiting_prototype_confirmation`
- `development`
- `waiting_uat`
- `delivery`
- `done`

### 6.3 阶段推进规则

#### 阶段 1：需求分析

必须产出：

- `docs/requirement.md`

必须输出：

- 需求要点
- 范围边界
- 验收标准
- 风险与未决项

确认方式：

- 聊天中回复 `1`
- 或通过 n8n 表单确认

#### 阶段 2：原型

必须产出：

- `docs/prototype.md`
- `prototype/` 下网页原型

限制：

- 不允许提前写 `src/`

必须输出：

- 页面结构
- 核心交互流程
- API 假设
- 风险与待确认项

#### 阶段 3：开发与测试

必须产出：

- 正式源码
- 自动化测试
- lint / test / build 结果

要求：

- 先实施计划
- 再开发
- 再测试
- 完成后进入 UAT 等待

#### 阶段 4：用户测试迭代

只允许围绕：

- `docs/uat-feedback.md`
- 用户明确反馈的问题

要求：

- 只修反馈项
- 不重做已确认部分
- 修复后重新验证

#### 阶段 5：交付

必须产出：

- `docs/delivery.md`

必须包含：

- 变更摘要
- 影响范围
- 测试结果
- 交付说明
- 回滚建议

---

## 7. Hook 设计

### 7.1 核心原则

用 Hook 做“硬约束”，避免阶段被跨越。

### 7.2 推荐 Hook 分工

#### A. `PreToolUse` -> `workflow-stage-guard.js`

职责：

- 拦截 `Write/Edit/MultiEdit`
- 拦截关键 `Bash`
- 校验当前阶段与目标路径是否匹配

规则示例：

- 需求阶段：
  - 允许：`docs/requirement.md`
  - 拒绝：`src/**`、`prototype/**`
- 原型阶段：
  - 允许：`docs/prototype.md`、`prototype/**`
  - 拒绝：`src/**`
- 开发阶段：
  - 允许：`src/web/**`、`src/app/**`、`src/web_admin/**`、`src/backend/**`
- 交付前：
  - 拒绝部署命令、发布命令

#### B. `UserPromptSubmit` -> `workflow-user-prompt.js`

职责：

- 在用户输入新需求时识别是否应初始化流程
- 给 Claude 注入轻量阶段提示

注意：

- 不做重逻辑
- 不访问大量文件
- 只做提醒和初始化判断

#### C. `PermissionRequest`

职责：

- 对危险操作做二次确认

适合拦截：

- `git push --force`
- `git reset --hard`
- `rm -rf`
- 部署命令
- 修改敏感配置

#### D. `TaskCompleted` 或 `Stop` -> `workflow-stage-sync.js`

职责：

- 自动检查当前阶段应有产物是否存在
- 记录阶段摘要
- 更新审计日志
- 可选写入 ECC governance/state-store

---

## 8. 与 n8n 的集成方式

### 8.1 保留双确认通道

推荐同时支持：

- 对话内回复 `1/2`
- n8n 表单确认

含义统一：

- `1` = 继续下一阶段
- `2` = 需要调整

### 8.2 脚本职责

保留 `flow-gate.sh` 的思路，但建议升级成 Node 版统一入口：

- `scripts/workflow/gate.js`

职责：

- 读取当前阶段
- 生成用户可读摘要
- 调用 n8n webhook
- 返回表单链接
- 在无 n8n 配置时回退到对话确认

### 8.3 n8n 回写闭环

n8n 提交结果后，不应只停留在 n8n 里，而应：

- 回写 `.workflow/state.json`
- 可选写入 `.workflow/approvals.json`
- 如开启 ECC governance，则写入治理事件

这样本地状态机和外部审批状态保持一致。

---

## 9. 与 ECC 能力的结合方式

### 9.1 技能入口

建议新增：

- `skills/stage-gated-delivery/SKILL.md`

职责：

- 定义整套 5 阶段流程
- 明确每阶段产出
- 明确什么时候必须停下来等待确认

### 9.2 代理协作建议

在不额外增加复杂性的前提下，建议在各阶段使用 ECC 现成代理思路：

- 需求分析阶段：`planner`
- 原型阶段：`architect`
- 开发阶段：`tdd-guide`
- 开发后：`code-reviewer`
- 敏感功能：`security-reviewer`
- 关键流程验证：`e2e-runner`

### 9.3 Governance 与 State Store

ECC 当前已有：

- 审批请求事件捕获
- 治理事件状态查询

因此这套流程的审批、越权操作、敏感命令可以统一进入治理体系，而不是散落在 shell 输出里。

---

## 10. 推荐组合方案

### 一期方案

推荐采用：

- `AGENTS.md / CLAUDE.md` 作为制度层
- `skills/stage-gated-delivery` 作为执行入口
- `.workflow/state.json` 作为状态机
- Hooks 作为强制门控
- n8n 作为可选审批通道

这是最平衡、最稳、最符合 ECC 当前能力边界的方案。

### 二期方案

当需要平台化或接入 CI/CD 时，再增加：

- SDK 控制层
- 服务端审批中心
- 多项目统一流程看板
- 多 worker 阶段内并行开发

---

## 11. 实施优先级

### P0：先做最小闭环

1. 固化项目级 `AGENTS.md` / `CLAUDE.md`
2. 新增 `.workflow/state.json`
3. 实现 `workflow-stage-guard.js`
4. 实现 `workflow-stage-sync.js`
5. 实现 `scripts/workflow/gate.js`

### P1：补齐体验

1. 增加 `skills/stage-gated-delivery/SKILL.md`
2. 增加兼容命令
3. 增加对话内 `1/2` 与 n8n 双通道回写

### P2：补齐治理与扩展

1. 接入 ECC governance/state-store
2. 增加审批审计
3. 增加阶段看板与状态查询
4. 增加多 worker 编排

---

## 12. 最终结论

这件事不应该在四种方案里“选一个”，而应该明确主次关系：

### 主方案

**Hooks + 状态机**

这是唯一能真正做到阶段门控的核心机制。

### 必备配套

**AGENTS.md / CLAUDE.md + Skill**

这部分负责让 Claude 理解流程、让团队理解流程、让流程有统一入口。

### 增强能力

**n8n**

适合把阶段确认从聊天扩展为外部审批，但不应取代本地状态机。

### 暂缓项

**SDK**

适合以后做成平台或 CI/CD 自动化系统，目前不作为首选实现。

---

## 13. 一句话建议

最终建议采用：

**`AGENTS/CLAUDE 约束 + Skill 入口 + Hook 强制门控 + 本地状态机 + 可选 n8n 审批`**

这套组合既能保留你现有方案里的优点，又能充分利用 ECC 当前项目已经具备的 Hook、治理、状态、编排能力，是真正可落地、可演进的整体解决方案。
