# Rust Backend Project Creation Design

## Scope

Project creation will initialize a runnable Rust backend for every newly created workspace. The feature will not support multiple backend languages yet, and it will not add a language picker to the frontend.

## Architecture

The server-side project creation path will own backend provisioning. When `/api/projects/create-workspace` creates or clones a workspace, it will allocate a backend port, persist that port in SQLite, create `src/backend/`, and write a minimal Rust `axum` service that reads the port from environment variables.

Port allocation will be deterministic after creation because the assigned port is stored in the application database. The generated backend will use a `.env` file for local development and will avoid hardcoded ports in Rust source code.

## Data Model

Add backend metadata to the user-scoped project registry, either as columns on `user_projects` or as a dedicated table keyed by `project_id`. The preferred shape is a dedicated table:

```sql
CREATE TABLE IF NOT EXISTS project_backends (
  project_id INTEGER PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'rust',
  port INTEGER NOT NULL UNIQUE,
  backend_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES user_projects(id) ON DELETE CASCADE
);
```

The unique `port` constraint prevents accidental reuse. `language` is still stored as `rust` so future migrations can introduce other languages without guessing old records.

## Port Allocation

Use a configurable range, with defaults such as `41000-41999`. Allocation checks existing `project_backends.port` records and selects the first free port in range. If the range is exhausted, workspace creation fails with a clear error and cleans up the just-created workspace directory.

The allocator must run in the same synchronous SQLite flow as project registration so concurrent requests cannot commit the same port. The database unique constraint remains the final guard.

## Generated Files

For each created project, generate:

```text
src/backend/
  .env
  Cargo.toml
  src/main.rs
```

`.env`:

```dotenv
BACKEND_PORT=41000
```

`Cargo.toml` will define a small binary using `axum`, `tokio`, and `dotenvy`. `src/main.rs` will load `.env`, bind `0.0.0.0:${BACKEND_PORT}`, and expose `GET /health` returning JSON.

Generation should not overwrite an existing backend directory in cloned repositories. If `src/backend` already exists, the project should still receive a port record and `.env` should only be created when absent.

## API Flow

After `addProjectManually()` returns the persisted project record, call a new backend provisioning service with `userId`, `projectId`, and `projectPath`.

The create workspace response should include backend metadata:

```json
{
  "project": {
    "id": 1,
    "name": "...",
    "backend": {
      "language": "rust",
      "port": 41000,
      "path": "/workspace/project/src/backend"
    }
  }
}
```

Existing project listing should also include this metadata when available, so the UI and future runners can discover the backend without reading files.

## Error Handling

If backend provisioning fails after a new workspace directory was allocated by the create flow, remove that workspace directory and do not leave a project record behind. For cloned repositories, the same cleanup behavior should apply to the allocated wrapper directory created during the request.

If a database record exists but files are missing, future repair behavior can regenerate missing files. That repair flow is out of scope for the first implementation.

## Testing

Add route-level tests around workspace creation to verify:

- A Rust backend directory is generated for a new workspace.
- `.env` contains the persisted backend port.
- The port is unique across two created projects for the same user.
- Existing `src/backend` in a cloned/imported project is not overwritten.

Run the repository's required checks before completion:

```bash
npm run lint
npm run typecheck
npm run build
```
