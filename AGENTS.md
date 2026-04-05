# Repository Guidelines

## 项目结构与模块组织
这是一个前后端同仓项目。`src/` 是 Vite + React 前端，主要按功能拆分到 `components/`、`hooks/`、`contexts/`、`i18n/`、`utils/` 与 `types/`。`server/` 是 Node.js/Express 后端，包含 `routes/`、`providers/`、`middleware/`、`database/` 与服务集成代码。`shared/` 存放前后端共享常量，`public/` 存放图标、PWA 资源与静态页面，`plugins/starter/` 是插件开发示例，`docker/` 提供容器化参考。

## 构建、测试与开发命令
- `npm install`：安装依赖，要求 Node.js 22+。
- `npm run dev`：同时启动后端和 Vite 开发服务器。
- `npm run client`：仅启动前端。
- `npm run server`：仅启动后端。
- `npm run lint`：检查 `src/**/*.{ts,tsx,js,jsx}`。
- `npm run typecheck`：执行 TypeScript 类型检查。
- `npm run build`：生成生产构建，提交前至少运行一次。
- `npm run preview`：本地预览构建产物。

## 代码风格与命名规范
项目使用 ES Modules、React 函数组件、Tailwind CSS 与 ESLint 9。优先保持“改动处就近一致”：前端文件通常为 2 空格缩进，旧的后端文件可能使用 4 空格，修改时跟随原文件。组件使用 `PascalCase`，Hook 使用 `useXxx`，工具函数和变量使用 `camelCase`。保持 import 顺序稳定，避免未使用导入，Tailwind 类名顺序交给 ESLint 规则维护。

## 国际化与扩展点
多语言文案位于 `src/i18n/locales/<locale>/`，新增界面文本时应同步更新至少 `en`，并检查 `zh-CN` 是否需要补齐。插件相关开发优先参考 `plugins/starter/`，不要直接在主应用中写死仅插件场景可复用的逻辑。

## 测试与验证要求
当前仓库未配置统一的 `npm test`，也几乎没有现成测试文件。新增功能或修复时，最低要求是运行 `npm run lint`、`npm run typecheck` 和 `npm run build`。涉及 UI 的改动，请附上截图；涉及会话、插件、认证或 provider 集成时，请在 PR 描述中写明手动验证步骤。

## 提交与 Pull Request 规范
提交信息遵循 Conventional Commits，仓库历史中常见格式如 `feat: ...`、`fix(editor): ...`、`chore(release): ...`，并由 `commitlint` 强校验。分支名可参考 `feat/your-feature-name`。PR 应保持单一主题，说明改动内容与原因，关联 issue；UI 变更附截图，Bug 修复附复现与验证方式。不要混入无关重构或格式化噪音。

## 配置与安全提示
不要提交密钥、令牌或本地路径配置。涉及 CLI、数据库或 WebSocket 行为时，优先检查 `server/` 中对应模块，并确保文档或默认配置不会暴露本地环境信息。
