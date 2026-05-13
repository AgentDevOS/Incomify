# 项目级安装方式

本文档说明如何把 `stage-gated-workflow-kit` 安装到**单个项目**里，并确保它**只影响当前项目**。

## 1. 适用范围

这是**项目级安装**，不是全局安装。

安装后只会影响：

- 当前项目目录
- 当前项目里的 Codex 会话，以及当前项目显式接入的 CI 或 git hook

不会影响：

- 其他项目

前提是你把文件放在**目标项目根目录**下，而不是放到用户主目录里的全局配置路径。

---

## 2. 最终目录结构

假设目标项目是：

```text
/path/to/your-project
```

安装完成后，项目里应当有这些文件：

```text
your-project/
  package.json
  AGENTS.md
  .workflow/
    state.example.json
    test-scenario.md
    test-report.md
    test-contract.example.json
    backend-contract.example.json
    e2e-report.example.json
    api-report.example.json
  skills/
    stage-gated-delivery/
      SKILL.md
  scripts/
    package.json
    run-all-tests.js
    verify-prototype.js
    test-verify-prototype.js
    test-workflow-config.js
    test-sync-backend-api-paths.js
    workflow/
      config.cjs
      config.js
      sync-backend-api-paths.js
      state.cjs
      state.js
      gate.cjs
      gate.js
      doctor.js
    hooks/
      workflow-stage-guard.js
      workflow-stage-sync.js
```

说明：

- `package.json`：workflow 自测命令
- `AGENTS.md`：Codex 项目级流程说明
- `.workflow/state.example.json`：状态文件模板
- `.workflow/test-scenario.md`：workflow 自测场景
- `.workflow/test-report.md`：workflow 测试报告样例
- `.workflow/test-contract.example.json`：测试契约样例
- `.workflow/backend-contract.example.json`：后端契约结构样例，接入项目必须替换为当前 app 的真实 API 清单
- `.workflow/e2e-report.example.json`：真实 E2E 结构化报告样例
- `.workflow/api-report.example.json`：后端 API 请求级测试结构化报告样例
- `skills/stage-gated-delivery/SKILL.md`：流程技能入口
- `scripts/package.json`：确保 workflow / hooks 脚本按 CommonJS 运行
- `scripts/run-all-tests.js`：统一测试汇总和报告生成脚本
- `scripts/verify-prototype.js`：原型阶段可执行 HTML 交互校验
- `scripts/test-verify-prototype.js`：原型校验器自测
- `scripts/test-workflow-config.js`：阶段门控配置与后端 API 覆盖校验自测
- `scripts/test-sync-backend-api-paths.js`：Rust axum API 路由扫描器自测
- `scripts/workflow/sync-backend-api-paths.js`：从 `src/backend/**/*.rs` 中的 axum `route` / `nest` 写法辅助生成 `backend.apiPaths`
- `scripts/workflow/*`：状态机与命令
- `scripts/hooks/*`：可复用阶段检查脚本，供 git hook、CI 或外层 runner 接入

补充约束：

- 模板接入后，所有需要用户选择的提问默认应使用聊天式选项输入
- 不应依赖终端菜单交互，不要提示用户使用方向键、回车选中、`ctrl+o`、`Esc` 等按键
- 推荐统一文案为“可选：`确认`、`调整`、`取消/暂不继续`、`其他，请补充一句话说明`”
- 原型阶段产出的 `prototype/index.html` 必须是可交互原型，不能只提供静态视觉稿
- 原型文档里承诺的按钮、表单、切换、弹层、跳转和状态变化，都应在页面中真实可操作
- 验收原型时，默认标准是“基本原型描述成什么样，做出来就应是什么样”
- 原型阶段完成前必须通过 `npm run verify:prototype`；`node scripts/workflow/gate.js ready --summary "原型完成"` 会再次执行同类检查
- 如果项目包含后端服务，需求阶段应先整理“用户使用场景”列表并请用户确认，再写入 `docs/requirement.md`
- 开发阶段每个用户使用场景都必须有完整流程测试，每个后端 API 都必须有请求级测试用例
- 后台契约必须在 `.workflow/test-contract.json` 中声明 `backend.language=rust`、`backend.framework=axum`、`backend.database=sqlite`，并把当前 app 的真实 API 清单写入 `backend.apiPaths`
- 后端 API 测试结果必须写入 `.workflow/api-report.json`，并由 `npm run test:all` 汇总到 `docs/test-report.json` 的 `api.cases`
- 开发阶段至少要有 1 条真实 E2E 自动化测试通过，且每个交付目标都要有真实 E2E 覆盖
- 推荐把后端测试拆为 `src/backend/tests/api/` 与 `src/backend/tests/workflows/`，分别对应接口覆盖和场景流程覆盖

---

## 3. 安装步骤

### 方案 A：安装到一个全新项目

把 kit 中的文件复制到目标项目根目录，**注意要包含点目录**：

```bash
rsync -av /path/to/stage-gated-workflow-kit/ /path/to/your-project/
```

不要用只复制普通文件的方式，例如 `cp -r *`，否则 `.workflow/` 这类点目录通常不会被带过去。

确认目标项目里已经有 `.workflow/state.example.json` 之后，在目标项目根目录执行：

```bash
mkdir -p .workflow
cp .workflow/state.example.json .workflow/state.json
node scripts/workflow/gate.js init "项目名称"
```

然后检查状态：

```bash
node scripts/workflow/gate.js status
```

---

### 方案 B：安装到一个已有项目

已有项目通常已经有自己的：

- `scripts/`
- `AGENTS.md`

这时不要直接覆盖，按下面方式处理。

#### 第一步：复制新增文件

把以下文件复制进目标项目：

- `scripts/workflow/config.js`
- `scripts/workflow/config.cjs`
- `scripts/workflow/state.js`
- `scripts/workflow/state.cjs`
- `scripts/workflow/gate.js`
- `scripts/workflow/gate.cjs`
- `scripts/workflow/doctor.js`
- `scripts/workflow/sync-backend-api-paths.js`
- `scripts/run-all-tests.js`
- `scripts/verify-prototype.js`
- `scripts/test-verify-prototype.js`
- `scripts/test-workflow-config.js`
- `scripts/test-sync-backend-api-paths.js`
- `scripts/hooks/workflow-stage-guard.js`
- `scripts/hooks/workflow-stage-sync.js`
- `scripts/package.json`
- `package.json`
- `skills/stage-gated-delivery/SKILL.md`
- `.workflow/state.example.json`
- `.workflow/test-scenario.md`
- `.workflow/test-report.md`

#### 第二步：处理 `AGENTS.md`

如果项目还没有 `AGENTS.md`：

- 直接复制 kit 里的 `AGENTS.md`

如果项目已经有 `AGENTS.md`：

- 不要覆盖
- 把 kit 里的 Codex 阶段门控、原型校验和测试要求合并进去

#### 第三步：初始化工作流状态

在目标项目根目录执行：

```bash
mkdir -p .workflow
cp .workflow/state.example.json .workflow/state.json
node scripts/workflow/gate.js init "项目名称"
```

---

## 4. 如何确认它是“项目级生效”

只要满足下面三个条件，它就是项目级，不会影响其他项目：

1. 配置文件在项目目录下

例如：

```text
your-project/.workflow/state.json
```

2. 门控命令使用项目相对路径

例如：

```bash
node scripts/workflow/gate.js status
```

3. 没有把同样的 workflow 文件复制到其他项目或全局目录

---

## 5. 初始化后怎么用

初始化：

```bash
node scripts/workflow/gate.js init "项目名称"
```

查看状态：

```bash
node scripts/workflow/gate.js status
```

建议在正式调用 Codex 前先执行：

```bash
node scripts/workflow/doctor.js
```

当前阶段完成，进入等待确认：

```bash
node scripts/workflow/gate.js ready --summary "当前阶段已完成"
```

开发阶段完成，且检查通过：

```bash
node scripts/workflow/gate.js ready --summary "开发完成" --checks lint,test,build
```

用户确认后推进：

```bash
node scripts/workflow/gate.js confirm
```

用户拒绝并继续留在当前阶段：

```bash
node scripts/workflow/gate.js reject "需要调整的点"
```

如果你会在 Codex 里配合 superpowers 推进工作流，推荐按下面的顺序使用：

- 需求阶段先用 `/brainstorming`
- 需求完成后切到 `/writing-plans`
- 进入执行阶段后用 `/executing-plans`

---

## 6. 常见问题

### 问题 1：项目里已经有 `scripts/` 目录，会冲突吗？

通常不会。

这套文件放在：

- `scripts/workflow/`
- `scripts/hooks/`

只要不要覆盖已有同名文件即可。

### 问题 2：我只想让某几个项目用这套流程

那就只把这些文件复制到那几个项目里。

### 问题 3：开发阶段还要修改 `package.json`、锁文件、迁移目录怎么办？

可以在 `.workflow/state.json` 里补：

```json
{
  "customAllowedPaths": [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "prisma/",
    "migrations/"
  ]
}
```

### 问题 4：项目启用了 `"type": "module"` 会不会把 gate / hook 脚本跑坏？

会有这个风险。

这套 kit 已经额外带了：

```text
scripts/package.json
```

内容是：

```json
{
  "type": "commonjs"
}
```

它的作用是把 `scripts/` 子树固定为 CommonJS，这样 `scripts/workflow/gate.js` 和 `scripts/hooks/*.js` 不会因为项目根 `package.json` 的 `"type": "module"` 而报 `require is not defined`。

### 问题 5：Codex 会不会自动拦截？

不会。`AGENTS.md` 对 Codex 是行为约束，不是运行时 Hook。要获得“漏跑也会失败”的硬门控，应至少接入下面之一：

- CI：push / PR 时运行 `npm run verify:prototype`
- git hook：`pre-commit` 或 `pre-push` 运行 `npm run verify:prototype`
- 外层 runner：所有阶段结束都由 runner 调用 `gate.js ready`

---

## 7. 推荐安装顺序

推荐按这个顺序安装：

1. 复制 `scripts/workflow/*`
2. 复制 `scripts/hooks/*`
3. 复制 `scripts/package.json`
4. 复制 `scripts/run-all-tests.js`、`scripts/verify-prototype.js`、`scripts/test-verify-prototype.js`、`scripts/test-workflow-config.js`、`scripts/test-sync-backend-api-paths.js`
5. 复制 `package.json`
6. 复制 `skills/stage-gated-delivery/SKILL.md`
7. 复制或合并 `AGENTS.md`
8. 复制 `.workflow/state.example.json`、`.workflow/test-scenario.md`、`.workflow/test-report.md`、`.workflow/test-contract.example.json`、`.workflow/backend-contract.example.json`、`.workflow/e2e-report.example.json`、`.workflow/api-report.example.json`
9. 生成 `.workflow/state.json`
10. 按项目实际情况生成 `.workflow/test-contract.json`
11. 执行 `npm install`
12. 执行 `node scripts/workflow/gate.js init "项目名称"`
13. 执行 `node scripts/workflow/doctor.js`

---

## 8. 一句话结论

这套 kit 只要按本文档安装到**项目根目录**，Codex 会通过 `AGENTS.md` 获得项目级流程约束；硬门控应由 `gate.js`、`npm run verify:prototype`、CI、git hook 或外层 runner 执行，不应只依赖模型自觉。
