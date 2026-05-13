# stage-gated-workflow-kit-auto-test

用于验证 `../stage-gated-workflow-kit` 模板的自动化测试工程。

自动化测试生成的项目副本与运行产物默认落在仓库内固定目录 `./.artifacts/workspaces/`，便于直接查看每次测试实际操作的项目。

## 覆盖范围

- 初始化 `.workflow/state.json`
- `ready` / `confirm` / `reject` 状态流转
- 阶段必需文件校验
- 开发阶段 `docs/test-report.md` 测试凭证校验
- 模板自带 `scripts/run-all-tests.js` 在接入项目中的表现
- 开发阶段源码目录是否符合 `src/app/android`、`src/app/ios`、`src/web`、`src/miniprogram`、`src/backend`、`tests`
- 对测试内动态生成的不合规接入项目做结构审计与伪测试脚本审计，防止仅靠占位文案或文件存在性检查冒充测试

当前默认回归先聚焦模板规则与简单接入项目验证，不把 Claude CLI 的真实业务场景回归纳入 `npm run test:all`。真实业务场景通过 `claude -p` 驱动，单独执行。

## 运行方式

```bash
npm run test:all
```

运行后可在以下目录查看自动化测试生成的项目：

```bash
stage-gated-workflow-kit-auto-test/.artifacts/workspaces/
```

或按阶段执行：

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:claude
```

其中：

- `test:e2e`：当前简单 E2E 回归，覆盖模板自带测试链路与接入项目审计
- `test:e2e:claude`：真实业务场景的 Claude CLI 回归

真实 Claude CLI 回归现在会额外产出：

- `.workflow/claude-cli-run-state.json`：断点恢复状态
- `.workflow/claude-cli-run-summary.json`
- `.workflow/claude-cli-run-summary.md`

如果真实 CLI 场景在工作区中途中断，再次对同一工作区执行 `scripts/run-claude-scenario.js` 时，会优先尝试按状态文件继续推进。

测试目录已拆分为 `shared/`、`unit/`、`integration/`、`e2e/workflow/`、`e2e/audit/`、`e2e/todo-rn-java/`、`e2e/plane-shooter-web/`，详细说明见：

- `tests/README.md`
