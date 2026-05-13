# Stage-Gated Workflow 测试报告样例

## 1. 用途

这份文件用于说明 `scripts/run-all-tests.js` 的输出格式，以及 kit 在项目中的通用回归验证方式。

## 2. 关注点

- 测试报告写入 `docs/test-report.md`
- 结构化测试结果写入 `docs/test-report.json`
- `test:e2e` 会额外产出 `.workflow/e2e-report.json`
- 只执行项目中已经定义的测试或构建脚本
- 对未定义的脚本标记为跳过，而不是误判为失败
- 失败时在当前步骤停止，并保留已执行结果

## 3. 推荐命令

```bash
npm run test:all
node scripts/workflow/sdk-stage-test.mjs
```

## 4. 说明

项目接入 kit 后，应根据自身业务补充 `lint`、`test:unit`、`test:integration`、`test:e2e`、`build` 等脚本。
这份样例不绑定具体业务，不代表任何固定原型、页面或领域模型。

开发阶段还应补充 `.workflow/test-contract.json`，至少声明：

- `implementationType`
- `deliveryTargets`
- `e2e.frameworks`
- `e2e.minimumRealE2ECount`
- `e2e.requiredRealE2EScenarios`
- 如包含后端 API，还要声明 `backend.language=rust`、`backend.framework=axum`、`backend.database=sqlite`，并把当前 app 的真实 API 清单写入 `backend.apiPaths`；可用 `npm run sync:backend-api-paths` 从 axum 路由代码辅助生成后再核对
- 如包含后端 API，还要生成 `.workflow/api-report.json`，让 `npm run test:all` 汇总到 `docs/test-report.json` 的 `api.cases`

平台默认 E2E 方案：

- Flutter：`Patrol`
- React Native：`Detox`
- Web：`Playwright`
- 原生 iOS：`XCUITest`
- 原生 Android：`Espresso`
- 小程序原生：`miniprogram-automator`

如果项目包含后端服务，建议在需求文档中先列出用户使用场景，再在测试报告中明确标注：

- 已覆盖哪些用户使用场景的完整流程测试
- 已覆盖哪些后端 API 的接口测试
- 每条 API 测试记录都应包含 `method`、`path`、`status=passed` 和 `testFile`，且 `testFile` 位于 `src/backend/tests/`

Todo 示例可写成：

- 用户使用场景：注册、登录、退出登录、查看 Todo 列表、新增 Todo、修改 Todo、删除 Todo
- API：`POST /api/register`、`POST /api/login`、`POST /api/logout`、`GET /api/todos`、`POST /api/todos`、`PUT /api/todos/{id}`、`DELETE /api/todos/{id}`
