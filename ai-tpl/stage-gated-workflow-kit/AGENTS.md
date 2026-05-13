# Repository Guidelines

## Project Purpose
这是一个面向 Codex 的通用项目模板，核心目的是把测试当成交付门槛而不是可选项：AI 在开发时应尽可能补齐并执行所有可测内容，至少覆盖单元测试、集成测试和 E2E（端到端）测试。仓库本身不是业务应用；这个模板最终交付给实际使用者时，默认使用形态是聊天式协作：用户通过对话提出需求并推动开发，而不是直接操作一个独立的业务界面。

真实 E2E 约束：

- 真实 E2E 不能用 `pumpWidget`、mock 路由、只断言文案存在的 widget 测试冒充
- 真实 E2E 必须通过已构建 app 或真实运行时启动，并在模拟器、真机或浏览器自动化环境中执行

对于带后端服务的项目，默认把"用户使用场景"作为测试范围定义方式，而不是要求小白用户先写抽象业务模型。AI 应先列出"用户会怎么使用这个系统"的场景清单，请用户确认后写入 `docs/requirement.md`。开发阶段后，这份已确认的用户使用场景清单必须一一映射为完整流程测试；同时，每个后端 API 都必须至少有一条独立的请求级测试用例，不能只靠流程测试或纯函数单测间接覆盖。流程测试与 API 请求测试不能互相替代，缺少任一维度都不应视为测试完成。后台契约必须写入 `.workflow/test-contract.json` 的 `backend` 字段，固定声明 `language=rust`、`framework=axum`、`database=sqlite`，并把当前 app 的真实 API 清单写入 `apiPaths`；可用 `npm run sync:backend-api-paths` 从 axum 路由代码辅助生成后再核对。每个 API 的通过记录必须写入 `.workflow/api-report.json`，并由 `npm run test:all` 汇总到 `docs/test-report.json` 的 `api.cases`。
如果后台测试阶段需要数据库，一律使用 `SQLite`，不要把测试闭环建立在 MySQL、PostgreSQL、MongoDB 或其他数据库之上；如用户后期部署需要其他数据库，应在交付后的部署配置中自行调整。

如果目标项目是移动端 `app`，且用户没有明确指定其他技术方案，默认优先推荐使用 `React Native`。原因不是技术偏好，而是测试交付策略：只有采用 `React Native`，才适合把 `Detox` 作为默认的移动端 `E2E` 自动化测试方案接入开发流程。这样更容易建立可重复执行的端到端验证，能更早发现关键路径问题，并提高一次性交付时的稳定性，降低遗留 bug 风险。若用户已明确指定 Flutter、原生双端或其他栈，应同步说明默认 E2E 方案已切换，不再沿用 `Detox`。

平台默认 E2E 方案：

- Web：`Playwright`
- 小程序原生：`miniprogram-automator`

## Commit & Pull Request Guidelines
提交信息保持短小且可扫描，现有历史已有 `docs: ...`、`fea: ...`、`Add ...` 等形式。建议统一为 `<type>: <summary>`，如 `docs: refine install guide`、`feat: tighten stage guard`。PR 需要说明修改目的、影响的阶段、验证命令，以及是否会改变模板接入方的默认行为；涉及阶段边界、Codex 执行约束、Hook、CI 或输出文档格式时，附上示例命令和结果。

## Agent-Specific Instructions
默认工作范围是当前模板仓库本身。不要主动把这些外部项目纳入排查范围，也不要修改它们的文件。若用户同时提到模板和外部项目，先按用户明确指定的边界执行；如果边界不清晰，默认先聚焦模板仓库，再决定是否扩展到外部项目。

### 回复语言

AI 默认必须使用中文回复用户，包括需求澄清、方案说明、阶段状态、验证结果和交付总结。当前对话默认视为“完全不懂技术的人”在参与，因此回复时要尽量用最普通、最直接的中文表达，避免偏技术的话术、行话、缩写和专业术语。必须讲人话，先说结论，再说必要说明；如果某个词不能省略，就顺手用一句白话解释它是什么意思。只有当用户明确要求使用其他语言，或需要保留代码、命令、错误信息、API 名称、配置键、文件路径等原文时，才可以使用非中文内容。

### 极其重要：Codex 必须使用 Superpowers

这是最高优先级的强制规则。Codex 处理任何新项目、新需求、功能变更、缺陷修复、架构调整或交付验证任务时，必须使用 `superpowers` 工作流。不得跳过、弱化、替代或延后执行；不得在未完成对应 `superpowers` 阶段前直接写代码、改配置、生成交付物或宣称任务完成。

强制阶段对应关系：

- 需求起点：必须先使用 `superpowers:brainstorming`，对应命令入口为 `/brainstorming`，澄清目标、约束、验收标准、用户使用场景、非目标和可选方案。
- 需求确认后：必须使用 `superpowers:writing-plans`，对应命令入口为 `/writing-plans`，把已确认需求整理为阶段计划、文件范围、测试策略和验收清单。
- 执行阶段：必须使用 `superpowers:executing-plans`，对应命令入口为 `/executing-plans`，按计划实施、运行验证、记录结果，并在交付前检查阶段门控条件。

如果当前 Codex 环境没有安装或无法调用 `superpowers`，必须明确告知用户 `superpowers` 不可用，并暂停进入实现、修改或交付步骤；不得静默降级为普通执行流程。只有纯解释、状态查询、查看文件、运行用户明确指定的只读命令、或用户明确要求跳过流程且不涉及改动时，才可以不触发 `superpowers` 阶段。

### Codex 门控边界

`AGENTS.md` 对 Codex 是行为约束，不是运行时 Hook。不要把“写在 AGENTS.md 里”描述成硬门控；真正可重复执行的门控必须落到脚本、CI、git hook 或外层 runner。Codex 在阶段完成前必须主动运行对应检查命令；如果命令失败，应修复产物并重新运行，不得宣称该阶段完成。

原型阶段的最低硬检查命令是：

```bash
npm run verify:prototype
node scripts/workflow/gate.js ready --summary "原型完成"
```

`gate.js ready` 会复用原型校验逻辑，因此即使 Codex 忘记单独执行 `npm run verify:prototype`，进入等待确认时也会被脚本拦住。若接入项目配置了 CI 或 git hook，也应复用同一个 `npm run verify:prototype` 命令，避免出现“Codex 漏跑但仍能合入”的情况。

### 完成后的默认合入规则

如果实现工作是在隔离 worktree 或功能分支中完成的，完成实现并通过相关验证后，必须自动合回当前 `dev` 分支，让主工作区直接获得最终代码。除非用户在开始或执行过程中明确要求“先不合并”“保留隔离 worktree”或“只提交 PR”，否则不应在验证通过后再次要求用户选择是否合并。

合并前必须检查当前 `dev` 工作区状态，避免覆盖用户未提交改动；如存在无关改动，应保护这些改动后再合并。合并后必须在 `dev` 上重新运行与本次变更相关的验证命令，并把验证结果记录在交付回复中。任何对 `stage-gated-workflow-kit` 模板目录的改动，合并后还必须重新运行 `stage-gated-workflow-kit-auto-test` 自动化测试；未重新执行自动化测试不得宣称模板改动已完成验证。

### 用户选择与提问方式

当需要用户做选择、确认方向、确认阶段状态或补充约束时，优先提供简短、互斥、带数字编号的选项文本，并要求用户回复对应数字进行选择。不要只给开放式问题。除非确实无法预设选项，否则应采用下面的方式组织提问：

- 单选：列出明确的数字选项，例如 `1. 网页`、`2. 小程序`、`3. 继续当前方案`，并说明“回复数字选择”。
- 多选：列出可组合的数字选项，并说明“可多选，回复数字组合，例如 `1,3`”。
- 确认类问题：优先使用 `1. 确认`、`2. 调整`、`3. 取消/暂不继续` 这类选项。
- 需要开放补充时，也应先给出主要数字选项，并提供 `其他，请补充一句话说明` 选项。

开始新项目时，必须先让用户在“网页”和“小程序”之间二选一。不要默认扩展到其他平台，也不要在未确认平台前继续讨论实现细节。

原型阶段必须使用原生 HTML 生成可直接打开的静态原型，并统一放在目标项目的 `prototype/` 目录下，例如 `prototype/index.html`、`prototype/login.html`、`prototype/dashboard.html`。不要把原型页面生成到 `src/web/`、项目根目录或其他正式源码目录。若原型包含多个页面，必须按页面逐个打开检查并向用户逐页确认；未完成逐页确认、未通过 `npm run verify:prototype`、未通过 `gate.js ready` 前，不得将原型阶段标记为 ready 或进入开发阶段。

如果目标项目是 Web 项目，正式前端代码必须以 `src/web/` 作为根目录组织，不要把 Web 入口、样式、脚本或测试散落到项目根目录。默认结构应类似：

- `src/web/index.html`
- `src/web/css/main.css`
- `src/web/js/main.js`
- `src/web/js/player.js`、`src/web/js/enemy.js`
- `src/web/tests/`

如果目标项目是 iOS、Android、小程序或后端项目，也遵循同一原则：正式代码和对应测试都要跟随各自的 `src/...` 根目录组织，不要散落到项目根目录。默认结构应类似：

- `src/app/ios/`
- `src/app/ios/tests/`
- `src/app/android/`
- `src/app/android/tests/`
- `src/miniprogram/`
- `src/miniprogram/tests/`
- `src/backend/`
- `src/backend/tests/`

如果目标项目需要后端服务，后台只使用 `Rust`，并默认选择 `axum` 框架。不要把 `Node.js`、`Express`、`Java`、`Go`、`Python` 或其他语言作为后台实现方案、默认方案、候选方案或推荐方案；如果用户明确提出其他后台语言，应先说明当前模板后台只支持 `Rust`，并让用户确认是否改为 `Rust` 或另行扩展模板能力。需要数据库时默认使用 `SQLite`。在需要给用户提供技术选型时，凡是涉及后台、保存到后台、API、数据库或服务端持久化，都只能提供 `Rust + axum + SQLite` 这一类后台方案，不要再列出 `Node.js + Express + SQLite`、纯静态后续补后台等会绕开 Rust 后台约束的选项。

如果后台测试阶段需要数据库，一律使用 `SQLite`，不要把 MySQL、PostgreSQL、MongoDB 或其他数据库作为测试前提；如用户后期部署需要其他数据库，应在部署阶段或交付后自行调整。

如果目标项目需要定义后台服务进程名、服务名、容器名或部署单元名，默认命名格式应为 `<owner>-<project>-<env>-<shortid>-srv`。不要仅使用项目名，以免多用户、多环境或同名项目并行时发生冲突。`owner` 应优先使用仓库 owner、团队名或用户名；`env` 应使用 `dev`、`test`、`staging`、`prod` 等环境标识；`shortid` 应使用稳定短 ID，例如仓库路径 hash、仓库 ID 缩写或平台分配的短标识。该格式优先用于进程管理器、容器、部署配置、日志前缀、PID 文件与运行目录等需要唯一性的地方。

目标项目的后台构建产物文件名应单独固定为 `[项目名称]_srv_debug` 或 `[项目名称]_srv_release`。这个规则只约束交付二进制文件名，不替代运行时服务名、容器名或部署单元名规范。

对于接入项目中的自动化测试，也应默认放在各自的 `src/.../tests/` 或其子目录，而不是项目根目录 `tests/`、`e2e/`、`ios/`、`android/`、`miniprogram/`。只有在需求或原型阶段先明确约定偏离该结构后，才允许采用其他路径。
