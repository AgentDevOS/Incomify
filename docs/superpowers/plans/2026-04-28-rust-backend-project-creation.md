# Rust Backend Project Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a runnable Rust backend under `src/backend/` whenever a workspace project is created.

**Architecture:** Add a focused backend provisioning service that allocates a stable SQLite-backed port and writes the Rust template files. Call it from the existing project registration path after `user_projects` has an id, so project creation responses include backend metadata.

**Tech Stack:** Node.js, Express route helpers, better-sqlite3, Rust `axum` template, Node test runner.

---

### Task 1: Persist Backend Metadata

**Files:**
- Modify: `server/database/init.sql`
- Modify: `server/database/db.js`

- [ ] Add a `project_backends` table keyed by `project_id`, with unique `port`, `language`, `backend_path`, and timestamps.
- [ ] Add `projectBackendsDb` helpers for `createBackend`, `getBackendForProject`, `getUsedPorts`, and `deleteBackend`.

### Task 2: Add Rust Backend Provisioner

**Files:**
- Create: `server/services/project-backend.js`
- Test: `server/services/project-backend.test.js`

- [ ] Write failing tests that call `provisionRustBackendForProject()` and assert `Cargo.toml`, `.env`, and `src/main.rs` are created.
- [ ] Run `node --test server/services/project-backend.test.js` and confirm the missing service failure.
- [ ] Implement port allocation, SQLite persistence, and Rust template generation.
- [ ] Run the test again and confirm it passes.

### Task 3: Wire Project Creation

**Files:**
- Modify: `server/projects.js`
- Modify: `server/routes/projects.js`
- Test: `server/routes/projects.test.js`

**API Endpoints:**
- `POST /api/projects/create-workspace` — create workspace and now return backend metadata.
- `GET /api/projects/clone-progress` — clone workspace and now return backend metadata on completion.

- [ ] Add a failing route-helper test showing `addProjectManually()` returns `backend.language === "rust"` and creates `src/backend`.
- [ ] Call the provisioner from `addProjectManually()` once the project id exists.
- [ ] Include backend metadata in returned project objects.
- [ ] Run `node --test server/routes/projects.test.js`.

### Task 4: Verify

**Files:**
- No additional files.

- [ ] Run `node --test server/services/project-backend.test.js server/routes/projects.test.js`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
