# Repository Guidelines

## Project Structure & Module Organization
This is a single-package web app with a Vite + React frontend and Node/Express backend. Frontend source lives in `src/`, grouped into `components/`, `hooks/`, `contexts/`, `stores/`, `utils/`, `types/`, and `i18n/`. Backend code lives in `server/`. Shared constants are in `shared/`; static assets are in `public/`; production output is `dist/`. Docker support is under `docker/`, with longer docs in `docs/`.

## AI Template Contents
`ai-tpl/` stores the workflow and gatekeeping assets used when Incomify users create projects through vibing coding. Treat it as the source template for guiding AI-assisted project delivery: it defines staged requirements, prototype, development, verification, and delivery flows, plus scripts and hooks that enforce those stages. Keep hidden entries when moving or syncing this folder: `.gitignore`, `.workflow/`, `.worktrees/`, and nested `.workflow/` or `.claude/` directories are intentional. The source repository metadata is excluded here; `ai-tpl/.git` should not exist.

Key contents:
- `ai-tpl/AGENTS.md`, `ai-tpl/CLAUDE.md`, and `ai-tpl/claude-code-stage-gated-workflow-solution.md`: agent-facing instructions and reference material for the vibing coding workflow.
- `ai-tpl/docs/`: reusable workflow control files, including `SKILL.md`, `gate.js`, stage guard/sync hooks, settings, and state examples.
- `ai-tpl/stage-gated-workflow-kit/`: the project template kit that installs staged delivery gates, `.workflow/` contracts, workflow scripts, hooks, skills, and verification commands into generated projects.
- `ai-tpl/stage-gated-workflow-kit-auto-test/`: automated-test harness for validating the staged workflow, including scenario runners, test suites, `.claude/` hooks, artifacts, and workflow state.
- `ai-tpl/demo/`: sample generated project showing how the gates, prototype docs, scripts, skills, backend/miniprogram sources, and demo dependencies fit together.

## Build, Test, and Development Commands
- `npm install`: install dependencies and native bindings.
- `npm run dev`: start backend and Vite client together.
- `npm run dev:restart`: clear stale dev ports, then restart.
- `npm run client` / `npm run server`: run one side only.
- `npm test`: run Node's built-in test runner.
- `npm run lint`: lint frontend files under `src/`.
- `npm run typecheck`: run `tsc --noEmit`.
- `npm run build`: create the production bundle.

## Coding Style & Naming Conventions
Use ES modules, React function components, and TypeScript where existing files do. Match local indentation; frontend files generally use 2 spaces. Name React components with `PascalCase`, hooks as `useXxx`, stores as `useXxxStore`, and utilities with `camelCase`. Keep imports grouped in ESLint order and remove unused imports. Tailwind class order is checked by ESLint.

## Testing Guidelines
Tests use Node's built-in `node --test` runner. Place tests next to covered code using `*.test.js`, as in `server/routes/auth.test.js` or `src/utils/prototypeLinks.test.js`. Add focused tests for routes, services, stores, persistence, and utilities. Before opening a PR, run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` when build output may change.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits enforced by `commitlint`, for example `feat(deployment): publish project file links`, `fix(projects): harden backend lifecycle proxy`, or `chore(dev): add restart script`. Keep each PR scoped to one topic. Include a description, linked issue when available, test results, and screenshots for UI changes. Document manual verification for auth, WebSockets, sessions, providers, deployments, or plugins.

## Security & Configuration Tips
Do not commit secrets, tokens, machine-specific paths, logs, or generated `dist/` changes unless a release task requires them. Prefer environment variables for local configuration, and review backend changes for exposure of workspace paths, credentials, or command output.
