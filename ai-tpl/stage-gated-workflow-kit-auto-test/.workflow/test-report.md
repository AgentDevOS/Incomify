# Stage-Gated Workflow 测试报告样例

## 1. 用途

这份文件用于说明 `scripts/run-all-tests.js` 的输出格式，以及 kit 在项目中的通用回归验证方式。

## 2. 关注点

- 测试报告写入 `docs/test-report.md`
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
