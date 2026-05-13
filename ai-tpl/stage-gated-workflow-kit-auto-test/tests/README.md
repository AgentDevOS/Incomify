# tests 目录说明

本目录按“测试层级 + 业务场景 + 共享模块”拆分，后续可以继续平滑扩展更多用例。

## 目录结构

- `shared/`
  - 公共基础设施。
  - `helpers.js`：工作区复制、文件写入、阶段命令执行、审计辅助。
  - `sdk-scenarios.js`：真实业务场景定义，当前由 Claude CLI 回归复用。
- `unit/`
  - 模板基础规则和最小状态机行为。
- `integration/`
  - 跨阶段流转、拒绝后重提、开发阶段测试凭证校验、写入限制。
- `e2e/workflow/`
  - 模板自带 `scripts/run-all-tests.js` 在接入项目中的表现。
- `e2e/audit/`
  - 不合规项目结构审计、伪测试脚本审计。
- `e2e/todo-rn-java/`
  - React Native Todo + Java 后端的 Claude CLI 真实流程场景。
- `e2e/plane-shooter-web/`
  - 网页飞机战斗游戏 + 分数保存后台的 Claude CLI 真实流程场景。

## 扩展建议

后续新增用例时建议遵循下面的粒度：

1. 先判断是否属于已有大类：`unit`、`integration`、`e2e`
2. 如果是新的真实业务场景，在 `e2e/` 下单独新建目录
3. 如果多个 Claude CLI 场景共享定义，把共用部分提到 `shared/sdk-scenarios.js`
4. 如果只是通用命令、文件操作或断言辅助，放到 `shared/helpers.js`

## 运行方式

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:claude
npm run test:all
```

## 复审建议

- 看模板基础规则：先读 `unit/` 和 `integration/`
- 看接入项目质量：读 `e2e/workflow/` 和 `e2e/audit/`
- 看后续 SDK 业务回归预留：读 `e2e/todo-rn-java/` 与 `e2e/plane-shooter-web/`
