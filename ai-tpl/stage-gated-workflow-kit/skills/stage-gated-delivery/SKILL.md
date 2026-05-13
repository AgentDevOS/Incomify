---
name: stage-gated-delivery
description: 需求分析、原型、开发测试、交付四阶段门控流程。每阶段完成后必须等待用户确认。
---

# Stage-Gated Delivery

## 何时使用

- 用户要你按固定阶段推进一个软件开发任务
- 需要“先确认需求，再做原型，再开发，再交付”
- 需要在每一阶段停下来等待用户确认

## 核心规则

1. 需求阶段先使用 `/brainstorming` 做需求发散和访谈，需求完成后切换到 `/writing-plans`，进入执行阶段后使用 `/executing-plans`

2. 当前阶段完成后，先运行：

```bash
node scripts/workflow/gate.js ready --summary "当前阶段已完成"
```

3. 用户确认后，再运行：

```bash
node scripts/workflow/gate.js confirm
```

4. 用户要求修改时，运行：

```bash
node scripts/workflow/gate.js reject "用户反馈内容"
```

5. 禁止在未确认时进入下一阶段

6. 开发阶段默认源码结构必须显式遵守：

```text
src/app/android/
src/app/ios/
src/miniprogram/
src/web/
src/backend/
```

7. 目录职责固定：

- Web 页面、前端脚本、样式放在 `src/web/`
- Web 项目默认以前端实现目录 `src/web/` 作为根目录，不要在项目根目录额外创建并行的 `index.html`、`css/`、`js/`、`assets/`、`tests/`
- Web 正式入口默认放在 `src/web/index.html`
- Web 样式默认放在 `src/web/css/`，例如 `src/web/css/main.css`
- Web 主脚本与子模块默认放在 `src/web/js/`，例如 `src/web/js/main.js`、`src/web/js/player.js`、`src/web/js/enemy.js`
- Web 测试默认放在 `src/web/tests/` 或其子目录，不要生成到项目根目录 `tests/`
- 小程序前端实现放在 `src/miniprogram/`
- 小程序项目的页面、组件、配置、脚本与测试默认都放在 `src/miniprogram/` 或其子目录，不要额外生成项目根目录 `miniprogram/`、`tests/`
- 服务端逻辑放在 `src/backend/`
- 后端测试默认跟随 `src/backend/`，例如 `src/backend/tests/`，不要生成到项目根目录 `tests/`
- 移动端相关内容放在 `src/app/android/` 与 `src/app/ios/`
- iOS 与 Android 项目的正式实现和对应测试默认都跟随 `src/app/ios/`、`src/app/android/` 组织，不要额外生成项目根目录 `ios/`、`android/`、`e2e/`、`tests/`
- 不要把正式代码散落在项目根目录或 `src/` 根目录

8. 如果某个端当前只需要占位，也应保留目录并写 `README.md` 说明，不要直接删掉结构

9. 所有面向用户的选择题都必须使用聊天式选项提问，不要生成终端交互菜单

10. 如果需要用户在多个选项中选择，必须直接输出简短、互斥、可点击的选项文本；不要要求用户输入 `1`、`2`、`3` 这类数字

11. 禁止引导用户使用方向键、回车选中、空格勾选、`ctrl+o`、`Esc` 等终端菜单操作

12. 对于“其他”选项，必须允许用户直接用自然语言补充，而不是只能通过菜单输入

13. 原型阶段产出的 `prototype/index.html` 必须是可交互原型，不能只做静态页面

14. 只要原型说明或页面文案里定义了点击、输入、切换、展开、跳转、提交等行为，就必须在原型中实现对应交互

15. 原型的默认验收标准是“基本原型描述成什么样，做出来就必须是什么样”，不要把关键交互推迟到开发阶段

16. 原型阶段完成前必须运行 `npm run verify:prototype`；进入等待确认时还必须运行 `node scripts/workflow/gate.js ready --summary "原型完成"`

17. 需求阶段优先参考 `.workflow/requirement-interview-template.md`，先把澄清问题问清楚，再写 `docs/requirement.md`

18. 每个阶段除了文件存在，还要满足内容契约：
- 需求文档要包含项目概述、功能需求、用户使用场景、验收范围、非目标、需求澄清
- 原型文档要包含页面清单、关键交互、验证方式
- 开发阶段测试报告要包含 `## 验证等级`
- 交付文档要包含交付物、启动方式、已知风险

19. 开发阶段要生成验证等级结果，可通过 `node scripts/workflow/gate.js verify-tier` 查看

20. 项目过程中的关键决定、问题和阶段备注可以写入：
- `.workflow/decisions.md`
- `.workflow/issues.md`
- `.workflow/stage-notes.md`

## 阶段定义

### 阶段 1：需求分析

产物：

- `docs/requirement.md`

补充要求：

- 需求阶段先使用 `/brainstorming`，把用户需求、使用场景和约束发散清楚
- 优先按 `.workflow/requirement-interview-template.md` 的提纲访谈
- `docs/requirement.md` 至少包含：`项目概述 / 功能需求 / 用户使用场景 / 验收范围 / 非目标 / 需求澄清`
- 需求完成后切换到 `/writing-plans`，再把确认后的内容整理成后续计划

如需在需求阶段澄清选项，必须像下面这样提问：

```text
你想实现什么类型的飞机游戏？

可选：`飞行射击`、`飞行跑酷`、`飞行模拟`、`先讨论一下`、`其他，请补充一句话说明`。
```

完成后必须对用户说：

```text
📋 需求分析已完成，请查看 docs/requirement.md。

如果确认，请回复 `确认`。
如果需要调整，请回复 `调整` 或直接说修改意见。
```

### 阶段 2：原型

产物：

- `docs/prototype.md`
- `prototype/index.html`

要求：

- `prototype/index.html` 必须可以直接打开并进行基础交互验证
- 用户应能操作原型完成关键路径，而不是只能查看静态样式
- `docs/prototype.md` 中描述的主要页面行为必须在原型中体现
- `docs/prototype.md` 至少包含：`页面清单 / 关键交互 / 验证方式`
- 原型阶段完成前必须先运行 `npm run verify:prototype`

完成后必须对用户说：

```text
🎨 原型已完成，请查看 prototype/index.html 和 docs/prototype.md。

如果确认，请回复 `确认`。
如果需要调整，请回复 `调整` 或直接说修改意见。
```

### 阶段 3：开发与测试

产物：

- 正式代码
- 自动化测试
- `.workflow/test-contract.json`
- `.workflow/api-report.json`（包含后端 API 时）
- `docs/code-review.md`
- `docs/test-report.md`
- `docs/test-report.json`
- `.workflow/verification-report.json`
- 默认源码结构 `src/app/android/`、`src/app/ios/`、`src/miniprogram/`、`src/web/`、`src/backend/`

补充规则：

- 执行实现与测试时使用 `/executing-plans`
- 如果项目类型是小程序，前端正式源码必须生成在 `src/miniprogram/`
- 小程序项目不要把正式实现写入 `src/web/` 作为替代；如需补充 Web 演示，只能作为额外产物，不能替代小程序源码目录
- 真实 E2E 至少要通过 1 条，并在 `.workflow/e2e-report.json` 中留下结构化证据
- Flutter 默认用 `Patrol`；React Native 默认用 `Detox`；Web 默认用 `Playwright`；原生 iOS 默认用 `XCUITest`；原生 Android 默认用 `Espresso`；小程序原生默认用 `miniprogram-automator`
- `.workflow/test-contract.json` 中声明的每个交付目标都必须至少有 1 条真实 E2E 通过记录
- 如果项目包含后端 API，`.workflow/test-contract.json` 必须声明 `backend.language=rust`、`backend.framework=axum`、`backend.database=sqlite`，并把当前 app 的真实 API 清单写入 `backend.apiPaths`；可用 `npm run sync:backend-api-paths` 从 axum 路由代码辅助生成后再核对
- 如果项目包含后端 API，`.workflow/api-report.json` 必须记录每个 API 的请求级测试通过结果，并由 `npm run test:all` 汇总到 `docs/test-report.json` 的 `api.cases`
- 每条 API 测试记录至少包含 `method`、`path`、`status=passed` 和 `testFile`，且 `testFile` 必须位于 `src/backend/tests/`
- `docs/test-report.md` 必须包含 `## 验证等级`
- `docs/test-report.json` 必须包含 `verification`
- 开发阶段允许执行本地 debug / 验证性构建，以证明当前实现可构建、可运行、可联调；这些产物不应被当作正式交付 release 包
- 不同平台的验证性构建语义可以不同：Web 可做本地预览或调试构建，Rust 后台可做 `cargo build`，并把构建产物命名为 `[项目名称]_srv_debug`；Android 可打 debug APK，小程序可生成可验证页面和预览素材

完成后必须先执行 `npm run review:code` 与 `npm run test:all`，确认 `lint`、单元测试、集成测试、E2E 测试、`review`、`build` 都已通过，然后运行：

```bash
node scripts/workflow/gate.js ready --summary "开发完成，测试与审核通过" --checks lint,test,review,build
```

然后对用户说：

```text
⚙️ 开发与测试已完成，请验收。

如果通过，请回复 `确认`。
如果发现问题，请回复 `调整` 或直接描述问题。
```

### 阶段 4：交付

产物：

- `docs/delivery.md`
- 可选的 `dist/` 或 `release/`

补充要求：

- `docs/delivery.md` 至少包含：`交付物 / 启动方式 / 已知风险`
- 正式 release 包只能在本阶段生成，不要在 `development` 阶段提前产出并宣称已交付
- 不同平台按各自打包方式整理正式交付物：Web 产出正式构建结果，Rust 后台产出 release 二进制并命名为 `[项目名称]_srv_release`，Android 产出 release APK/AAB，小程序产出预览图和上传/提审说明等交付材料

完成后项目进入 `done`。

## 快速检查

随时可以运行：

```bash
node scripts/workflow/gate.js status
node scripts/workflow/gate.js gate
```
