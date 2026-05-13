# 测试报告

## 概览

- 生成时间：2026/4/28 20:03:02
- 项目路径：`/Users/jon/Desktop/work/code/incomify-tpl/stage-gated-workflow-kit-auto-test`
- 测试策略：静态检查 -> 单元测试 -> 集成测试 -> E2E 测试 -> 构建检查
- 当前默认链路先覆盖模板规则、状态流转、接入项目审计与 run-all-tests 行为；Claude Code SDK 真实业务场景回归暂未接入默认 test:all。
- 最终结论：通过

## 结果明细

### 1. 静态检查

- 执行命令：`npm run lint`
- 测试内容：确认测试工程本身可执行基础检查脚本
- 执行结果：通过

```text
> lint
> node -e "console.log('模板测试项目无需额外静态检查')"

模板测试项目无需额外静态检查
```

### 2. 单元测试

- 执行命令：`npm run test:unit`
- 测试内容：验证模板初始化、必要文件约束和基础状态机行为
- 执行结果：通过

```text
> test:unit
> node --test tests/unit/*.test.js

✔ init 会创建初始状态并进入需求分析阶段 (51.150459ms)
✔ requirements_analysis 阶段缺少必要文件时 ready 应失败 (71.588166ms)
✔ requirements_analysis 阶段补齐 requirement 文档后可以进入等待确认 (71.806417ms)
✔ requirements_analysis 阶段文档缺少必需章节时 ready 应失败 (75.900875ms)
✔ init 会创建阶段记忆文件与基线快照 (45.252042ms)
✔ 模板说明应覆盖 /brainstorming -> /writing-plans -> /executing-plans 命令流 (0.523792ms)
✔ 模板说明应要求隔离分支完成后默认自动合回 dev (0.18375ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 356.681
```

### 3. 集成测试

- 执行命令：`npm run test:integration`
- 测试内容：验证完整阶段推进、拒绝回退和开发阶段测试凭证校验
- 执行结果：通过

```text
> test:integration
> node --test tests/integration/*.test.js

✔ reject 会停留在当前阶段并记录反馈，confirm 才会推进阶段 (167.826375ms)
✔ development 阶段缺少有效测试报告时 ready 应失败，补齐后可推进到 delivery (359.380709ms)
✔ development 阶段必须同时具备单元、集成和 E2E 测试报告记录 (215.535416ms)
✔ development 阶段缺少可验收预览部署证据时 ready 应失败 (209.3015ms)
✔ 需求分析阶段未 confirm 前禁止写 prototype，confirm 后才允许进入原型阶段 (267.565958ms)
✔ development 阶段默认禁止修改门控核心文件，但允许写测试契约与 E2E 产物 (296.946167ms)
✔ development 阶段禁止通过 Bash 绕过可写路径限制修改门控核心文件 (229.961917ms)
✔ note 会写入阶段记忆文件，verify-tier 会生成结构化验证报告 (109.6095ms)
✔ 项目在子目录中触发 Stop hook 时仍能向上定位模板脚本 (105.99375ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2004.358167
```

### 4. E2E 测试

- 执行命令：`npm run test:e2e`
- 测试内容：验证模板自带测试链路在接入项目中的报告生成行为，并审计动态生成的不合规项目
- 执行结果：通过

```text
> test:e2e
> node --test tests/e2e/workflow/*.test.js tests/e2e/audit/*.test.js

✔ 模板规则明确要求开发阶段保留结构化测试契约与平台目录约束 (0.6325ms)
✔ 不合规接入项目会被结构审计识别出未迁移到 src 的问题 (13.624792ms)
✔ 小程序项目会要求正式前端实现进入 src/miniprogram (9.446167ms)
✔ 不合规接入项目会被测试脚本审计识别出伪测试问题 (9.374709ms)
✔ 自动化测试工作区会落在仓库内固定产物目录 (7.426875ms)
✔ 模板自带 test:all 可以在接入项目里生成通过的测试报告 (875.707625ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 914.988917
```

### 5. 构建检查

- 执行命令：`npm run build`
- 测试内容：确认当前测试工程无需额外构建步骤
- 执行结果：通过

```text
> build
> node -e "console.log('模板测试项目无需构建产物')"

模板测试项目无需构建产物
```
