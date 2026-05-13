# Stage-Gated Workflow Kit

一套面向 Codex 的最小可运行分阶段确认流程示例包。

目标：

- 把研发流程拆成固定阶段
- 每阶段完成后显式进入“等待确认”
- 用户确认后才推进下一阶段
- 用脚本、CI / git hook 或外层 runner 做可重复门控

## 目录

```text
stage-gated-workflow-kit/
  package.json
  .workflow/state.example.json
  .workflow/deliverables.example.json
  .workflow/requirement-interview-template.md
  .workflow/test-scenario.md
  .workflow/test-report.md
  .workflow/test-contract.example.json
  .workflow/backend-contract.example.json
  .workflow/e2e-report.example.json
  .workflow/api-report.example.json
  skills/stage-gated-delivery/SKILL.md
  scripts/package.json
  scripts/run-all-tests.js
  scripts/verify-prototype.js
  scripts/test-verify-prototype.js
  scripts/test-workflow-config.js
  scripts/test-sync-backend-api-paths.js
  scripts/workflow/config.cjs
  scripts/workflow/config.js
  scripts/workflow/sync-backend-api-paths.js
  scripts/workflow/state.cjs
  scripts/workflow/state.js
  scripts/workflow/gate.cjs
  scripts/workflow/gate.js
  scripts/workflow/verification.cjs
  scripts/workflow/verification.js
  scripts/workflow/doctor.js
  scripts/hooks/workflow-stage-guard.js
  scripts/hooks/workflow-stage-sync.js
  scripts/hooks/workflow-session-start.js
  scripts/hooks/workflow-session-end.js
```

## 使用方式

把这些文件复制到目标项目根目录后：

```bash
node scripts/workflow/gate.js init "项目名称"
node scripts/workflow/gate.js status
node scripts/workflow/gate.js verify-tier
```

建议先跑一次环境诊断：

```bash
node scripts/workflow/doctor.js
```

阶段推进命令：

```bash
# 当前阶段产物完成后，进入“等待确认”
node scripts/workflow/gate.js ready --summary "当前阶段已完成"

# 开发阶段需要明确声明已通过的检查
node scripts/workflow/gate.js ready --summary "开发完成" --checks lint,test,build

# 用户确认后，推进到下一阶段
node scripts/workflow/gate.js confirm

# 用户要求修改，留在当前阶段
node scripts/workflow/gate.js reject "需要调整登录页交互"

# 可选：写入阶段记忆
node scripts/workflow/gate.js note decision "确认默认采用 React Native + Detox"
```

Codex 阶段内建议按下面的顺序使用 superpowers：

- 需求阶段：`/brainstorming`
- 需求完成后：`/writing-plans`
- 执行阶段：`/executing-plans`

注意：`AGENTS.md` 对 Codex 是行为约束，不是运行时 Hook。Codex 应主动运行检查命令；如果需要“漏跑也会失败”的硬门控，应把同一批命令接到 CI、git hook 或外层 runner。

## 状态机语义

- `ready`：当前阶段完成，进入等待确认
- `confirm`：用户确认，推进到下一阶段
- `reject`：用户不通过，留在当前阶段继续修改

这三个动作必须分开，不能把“阶段完成”和“用户确认”混成一个命令。

## 交互约束

模板默认要求 AI 通过聊天文本收集用户选择，不使用终端交互式菜单。

- 需要用户二选一或多选一时，直接输出简短、互斥、可点击的选项文本
- 不要要求用户输入 `1`、`2`、`3` 这类数字
- 不要要求用户使用方向键、回车选中、空格勾选、`ctrl+o` 或 `Esc`
- “其他”类选项应允许用户直接输入自然语言补充
- 原型阶段的 `prototype/index.html` 必须是可交互原型，不能只做静态页面占位
- 原型里声明过的按钮、切换、输入、提交、弹层、跳转等行为，页面中必须能实际操作
- 不允许把交互缺失解释为“开发阶段再实现”；原型阶段就应交付与原型说明一致的基础交互

如果目标项目是移动端 `app`，且用户未指定技术栈，默认优先建议使用 `React Native`。原因是移动端若要稳定接入 `Detox` 做 `E2E` 自动化测试，通常需要建立在 `React Native` 方案上；这样更容易把自动化测试纳入开发与验收流程，提升回归效率，并减少最终交付时的 bug 数量。如果用户已明确指定其他移动端技术方案，应明确告知默认 E2E 方案已经切换，并按该技术栈重新设计测试方案。

平台默认 E2E 方案：

- Flutter：`Patrol`
- React Native：`Detox`
- Web：`Playwright`
- 原生 iOS：`XCUITest`
- 原生 Android：`Espresso`
- 小程序原生：`miniprogram-automator`

示例：

```text
你想实现什么类型的飞机游戏？

可选：`飞行射击`、`飞行跑酷`、`飞行模拟`、`先讨论一下`、`其他，请补充一句话说明`。
```

## 默认阶段

1. `requirements_analysis`
2. `prototype`
3. `development`
4. `delivery`
5. `done`

## 默认目录边界

- 需求阶段：只允许写 `docs/requirement.md`
- 原型阶段：只允许写 `prototype/` 和 `docs/prototype.md`
- 开发阶段：默认允许写 `src/`、`lib/`、`integration_test/`、`patrol/`，以及反馈文档；正式代码和对应测试默认都应收口到各自的 `src/...` 子树，不要散落到项目根目录 `tests/`、`e2e/`、`ios/`、`android/`、`miniprogram/`
- 交付阶段：只允许写 `dist/`、`release/` 和 `docs/delivery.md`；正式交付包也应在这一阶段生成

如果你的项目还需要在开发阶段修改 `package.json`、`tsconfig.json`、数据库迁移目录等，可在 `.workflow/state.json` 的 `customAllowedPaths` 里补充。
`.workflow/` 目录默认只开放运行态文件和测试证据文件，例如 `state.json`、`audit.log`、`test-contract.json`、`e2e-report.json`、`api-report.json`、`verification-report.json`。`scripts/workflow/`、`scripts/hooks/`、`scripts/run-all-tests.js` 与 `.workflow/deliverables.json` 这类门控核心默认不允许 AI 在接入项目开发阶段直接改写；AI 应优先补实现、跑脚本、提交证据，由脚本决定状态流转。

如果项目需要后端服务，默认只使用 `Rust + axum + SQLite`。不要把 `Node.js`、`Express`、`Java`、`Go`、`Python` 或其他语言作为后台实现方案、默认方案、候选方案或推荐方案；如果用户明确提出其他后台语言，应先说明当前模板后台只支持 `Rust`，并让用户确认是否改为 `Rust` 或另行扩展模板能力。

如果后台测试阶段需要数据库，一律使用 `SQLite`。不要在测试阶段引入 MySQL、PostgreSQL、MongoDB 或其他数据库；如果用户后期部署需要其他数据库，应在部署阶段或交付后自行修改数据库配置。

如果项目需要约定后台服务进程名、服务名、容器名或部署单元名，默认命名格式建议使用 `<owner>-<project>-<env>-<shortid>-srv`。不要只使用项目名，否则多个用户的同名项目或同一项目的多个环境容易发生冲突。`owner` 建议使用仓库 owner、团队名或用户名；`env` 建议使用 `dev`、`test`、`staging`、`prod`；`shortid` 建议使用稳定短 ID，例如仓库路径 hash、仓库 ID 缩写或平台分配的短标识。

例如：

```json
{
  "customAllowedPaths": [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "prisma/"
  ]
}
```

## 阶段内容契约

除了“文件存在”，模板现在还会校验阶段产物的基本内容结构：

- 需求阶段：`docs/requirement.md` 至少包含 `项目概述 / 功能需求 / 用户使用场景 / 验收范围 / 非目标 / 需求澄清`
- 原型阶段：`docs/prototype.md` 至少包含 `页面清单 / 关键交互 / 验证方式`，`prototype/index.html` 必须存在可执行交互；`npm run verify:prototype` 和 `gate.js ready` 都会检查
- 开发阶段：`docs/test-report.md` 必须包含 `## 验证等级`，`docs/code-review.md` 必须保留审核摘要结构
- 交付阶段：`docs/delivery.md` 至少包含 `交付物 / 启动方式 / 已知风险`

如果要覆盖默认规则，可复制并修改：

```bash
cp .workflow/deliverables.example.json .workflow/deliverables.json
```

## Codex 硬门控建议

Codex 本身不会因为 `AGENTS.md` 中的一句话就像 Hook 一样强制拦截。模板提供同一套可执行检查，建议用三层方式接入：

```bash
npm run verify:prototype
node scripts/workflow/gate.js ready --summary "原型完成"
```

- Codex 主动执行：阶段完成前按 `AGENTS.md` 运行检查命令。
- git hook 兜底：在 `pre-commit` 或 `pre-push` 中运行 `npm run verify:prototype`。
- CI 兜底：在 push / PR 中运行 `npm run verify:prototype` 和后续阶段测试命令。

示例 GitHub Actions：

```yaml
name: Stage Gates

on:
  pull_request:
  push:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm run verify:prototype
```

## 验证等级

开发阶段会基于进入阶段时的基线快照，自动生成 `.workflow/verification-report.json`，并把结果写进 `docs/test-report.md` 与 `docs/test-report.json`。

- 小改动且测试完整：`LIGHT`
- 常规多文件改动：`STANDARD`
- 架构 / 安全 / 大范围改动：`THOROUGH`

也可以单独查看：

```bash
node scripts/workflow/gate.js verify-tier
```

## 构建与打包约定

模板默认把“开发阶段验证性构建”和“交付阶段正式打包”分开处理：

- `development` 阶段的 `build` 是验证性构建检查，目的是确认当前实现可构建、可启动、可联调、可支撑真实 E2E；这里允许生成 debug 或测试用途产物，但不应把正式 release 包写入 `dist/`、`release/`
- `delivery` 阶段才生成正式交付包，产物统一沉淀到 `dist/` 或 `release/`，并在 `docs/delivery.md` 说明交付物、启动方式和风险
- AI 在开发阶段可以自行执行本地调试构建，但不应在未进入 `delivery` 前提前做正式发布、外部分发或上线部署

不同交付目标的默认语义应按各自平台处理，不要误以为都等于 `npm run build`：

- Web：开发阶段做本地预览或调试构建；交付阶段执行正式前端构建，产出 release 静态资源
- 后台 Rust：开发阶段做 `cargo build` 或测试运行；交付阶段执行 `cargo build --release` 并整理二进制、配置和启动说明。构建产物命名固定为 `[项目名称]_srv_debug` 或 `[项目名称]_srv_release`
- Android：开发阶段打 debug APK 供安装验证；交付阶段打 release APK 或 AAB
- 小程序：开发阶段生成可验证页面与预览素材；交付阶段整理正式预览图、体验版说明、上传步骤或交付素材

建议目标项目按下面的方式区分脚本，而不是只保留一个泛化的 `build`：

```json
{
  "scripts": {
    "build": "开发阶段验证性构建检查",
    "package:web": "交付阶段正式打包 Web",
    "package:backend": "交付阶段正式打包后台",
    "package:android": "交付阶段正式打包 Android",
    "package:miniprogram": "交付阶段整理小程序交付素材",
    "package:all": "交付阶段一键汇总正式交付物"
  }
}
```

Rust 后台如果参与交付，建议进一步固定二进制命名：

- 开发阶段验证性构建：`[项目名称]_srv_debug`
- 交付阶段正式构建：`[项目名称]_srv_release`
- 这里的“项目名称”应使用项目初始化时确认的交付名称；如名称含空格或特殊字符，应先转换为稳定文件名再用于产物命名

这个命名规则用于 Rust 后台构建产物本身，与运行时服务名、容器名、部署单元名不是一回事；后者仍可继续使用独立的服务命名规范。

## 需求访谈与阶段记忆

- 需求阶段可先参考 `.workflow/requirement-interview-template.md`
- 模板会维护 `.workflow/decisions.md`、`.workflow/issues.md`、`.workflow/stage-notes.md`
- 也可以手动补充：

```bash
node scripts/workflow/gate.js note stage "用户要求先做 Web 原型"
node scripts/workflow/gate.js note issue "原型阶段被拒绝，需要补充错误反馈"
```

## 注意

- 这是一套“最小闭环实现”，重点是正确的门控语义，不包含 n8n 审批。
- 如果要接入 n8n，建议在 `gate.js confirm/reject` 外包一层 webhook 回写。
- 如果目标项目使用 `"type": "module"`，保留 `scripts/package.json` 可以避免 `scripts/workflow/*.js` 和 `scripts/hooks/*.js` 被按 ESM 解释。

开发阶段必须让 `lint`、`test:unit`、`test:integration`、`test:e2e`、`review:code`、`build` 都执行通过。这里的 `build` 指开发阶段验证性构建，不等同于交付阶段正式 release 打包。如果项目已经定义了这些脚本，可以运行：

```bash
npm run test:all
```

它会把汇总结果写入 `docs/test-report.md` 和 `docs/test-report.json`；开发阶段缺少任一必要脚本都会失败，不能用跳过脚本替代测试通过。

开发阶段还必须维护 `.workflow/test-contract.json` 与 `.workflow/preview-deploy.json`。前者用于声明当前项目的实现栈、交付目标和 E2E 最低覆盖要求；后者用于记录当前轮可供用户验收的测试包、预览环境或 staging 部署结果。若项目包含 Rust 后端，AI 应按当前 app 的真实路由把 `backend.apiPaths` 写入 `.workflow/test-contract.json`；可先运行 `npm run sync:backend-api-paths` 从 `src/backend/**/*.rs` 中的 axum `route` / `nest` 写法辅助生成，再人工核对。模板只校验“声明的每个 API 是否有测试证据”，不固定任何业务路径。模板会校验：

- 至少有 1 条真实 E2E 自动化测试通过
- `.workflow/test-contract.json` 中声明的每个 `deliveryTargets` 都有真实 E2E 覆盖
- E2E 框架与实现栈匹配
- `.workflow/e2e-report.json` 已被 `test:all` 汇总进 `docs/test-report.json`
- 如果 `.workflow/test-contract.json` 声明了 `backend.apiPaths`，`.workflow/api-report.json` 中必须有每个 API 的通过记录，并被汇总到 `docs/test-report.json` 的 `api.cases`
- `docs/test-report.json` 中必须同时包含 `verification` 结构化结果
- `.workflow/preview-deploy.json` 必须声明 `status`、`generatedAt` 与至少 1 个可验收目标；目标至少要包含产物路径、预览地址或环境说明中的一种

这里的“真实 E2E”不接受 widget 级伪装测试，至少要满足：

- 启动真实运行时，而不是直接构造组件树
- 在浏览器、模拟器或真机环境执行
- 覆盖一条完整用户主路径
- 有结构化通过记录

对于不同前端或客户端栈，`test:e2e` 默认应映射为：

- Flutter：`Patrol`
- React Native：`Detox`
- Web：`Playwright`
- 原生 iOS：`XCUITest`
- 原生 Android：`Espresso`
- 小程序原生：`miniprogram-automator`

如果不是这些默认组合，应在需求或原型阶段明确记录替代测试方案，避免到交付前才暴露自动化测试缺口。

## 后端测试范围建议

如果项目包含后端服务，需求阶段不要先逼用户写“业务 case 矩阵”这类复杂内容。更简单、也更适合模板默认行为的方式是：先让 AI 用自然语言列出“用户使用场景”，请用户确认后，再把它写进 `docs/requirement.md`。

推荐最少包含两类清单：

- 用户使用场景：用户会怎么使用系统
- API 清单：后端暴露了哪些接口，并写入 `.workflow/test-contract.json` 的 `backend.apiPaths`

开发阶段默认要求：

- 每个用户使用场景都必须至少有一条完整流程测试
- 每个后端 API 都必须至少有一条测试用例
- 后台契约必须声明 `backend.language=rust`、`backend.framework=axum`、`backend.database=sqlite`
- API 测试通过记录必须写入 `.workflow/api-report.json`，由 `npm run test:all` 汇总到 `docs/test-report.json` 的 `api.cases`
- 每条 API 测试记录至少包含 `method`、`path`、`status=passed` 和 `testFile`，且 `testFile` 必须位于 `src/backend/tests/`
- 流程测试不能只断言接口返回成功，还要断言关键业务结果和状态变化

Todo 示例：

- 用户使用场景：注册、登录、退出登录、查看 Todo 列表、新增 Todo、修改 Todo、删除 Todo
- API 清单：`POST /api/register`、`POST /api/login`、`POST /api/logout`、`GET /api/todos`、`POST /api/todos`、`PUT /api/todos/{id}`、`DELETE /api/todos/{id}`

推荐测试目录：

- `src/backend/tests/api/`：按接口粒度覆盖每个 API
- `src/backend/tests/workflows/`：按用户使用场景覆盖完整流程
