# Stage-Gated Workflow Test Scenario

## Goal

Validate that a project using this kit can complete a full four-stage gated workflow.

## Required outputs by stage

1. `requirements_analysis`
   - `docs/requirement.md`
2. `prototype`
   - `docs/prototype.md`
   - `prototype/index.html` with executable interactions
3. `development`
   - `src/app/android/README.md`
   - `src/app/ios/README.md`
   - `src/web/`
   - `src/backend/`
   - tests under the matching `src/.../tests/` tree
4. `delivery`
   - `docs/delivery.md`

## Workflow requirements

- Only work on the current stage.
- Do not call `confirm` on behalf of the user.
- In `requirements_analysis`, start with `/brainstorming`; after requirements are complete, switch to `/writing-plans`; in execution, use `/executing-plans`.
- When the prototype stage is complete, run `npm run verify:prototype` before `node scripts/workflow/gate.js ready`.
- When the current stage is complete, run `node scripts/workflow/gate.js ready`.
- In the development stage, report checks as `lint,test,build`.
- If a platform is only a placeholder, keep the directory and explain it with `README.md`.
- If the project has a backend service, first list user usage scenarios in plain language and confirm them with the user during `requirements_analysis`.
- Every confirmed user usage scenario must map to at least one full workflow test in the development stage.
- Every backend API must have at least one test case; API tests cannot be replaced by workflow tests.
- Rust backend projects must declare `backend.language=rust`, `backend.framework=axum`, `backend.database=sqlite`, and the current app's real API list in `.workflow/test-contract.json`.
- Backend API test evidence must be written to `.workflow/api-report.json` and summarized into `docs/test-report.json` as `api.cases`.

## Todo example

If the target project is a Todo app with backend service, the AI should first confirm user usage scenarios in plain language, for example:

1. Register
2. Login
3. Logout
4. View Todo list
5. Create Todo
6. Update Todo
7. Delete Todo

After the user confirms this list, write it into `docs/requirement.md` and use it as the source of workflow tests.

Related backend APIs should also be listed clearly, for example:

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/todos`
- `POST /api/todos`
- `PUT /api/todos/{id}`
- `DELETE /api/todos/{id}`

In the development stage:

- every usage scenario above should have at least one end-to-end workflow test
- every backend API above should have at least one API test case
- every API test case should include `method`, `path`, `status=passed`, and a `testFile` under `src/backend/tests/`
