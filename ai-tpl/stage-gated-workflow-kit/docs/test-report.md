# 测试报告

## 概览

- 生成时间：2026/4/30 12:04:21
- 项目路径：`/Users/jon/Desktop/work/code/incomify-tpl/stage-gated-workflow-kit`
- 已执行步骤：无
- 已跳过步骤：静态检查、单元测试、集成测试、E2E 测试、构建检查
- 缺少必要步骤：静态检查、单元测试、集成测试、E2E 测试、构建检查
- 最终结论：失败

## 说明

- 本报告由 `scripts/run-all-tests.js` 自动生成。
- 仅执行当前项目 `package.json` 中已定义的测试或构建脚本。
- 未定义的脚本会被标记为跳过，不视为失败。

## 验证等级

- 验证等级：STANDARD
- 评估原因：缺少阶段基线，已回退为 STANDARD 验证等级
- 改动文件数：0
- 估算改动行数：0
- 证据要求：结构化测试结果 + 构建通过
- 警告：当前阶段没有可比对的基线快照，建议按 init -> confirm 正常推进后再评估改动范围。

## 结果明细

## 已跳过步骤

1. 静态检查：未在 package.json 中定义对应脚本。
2. 单元测试：未在 package.json 中定义对应脚本。
3. 集成测试：未在 package.json 中定义对应脚本。
4. E2E 测试：未在 package.json 中定义对应脚本。
5. 构建检查：未在 package.json 中定义对应脚本。

## 缺少必要步骤

1. 静态检查：必须在 package.json 中定义 npm run lint 并执行通过。
2. 单元测试：必须在 package.json 中定义 npm run test:unit 并执行通过。
3. 集成测试：必须在 package.json 中定义 npm run test:integration 并执行通过。
4. E2E 测试：必须在 package.json 中定义 npm run test:e2e 并执行通过。
5. 构建检查：必须在 package.json 中定义 npm run build 并执行通过。
