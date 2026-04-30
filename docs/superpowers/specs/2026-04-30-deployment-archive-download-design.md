# Deployment Archive Download Design

## Goal

Add a delivery-stage download action that packages the current project's deployed artifacts into a zip file. The package must come from the existing deploy output, not from the project source tree.

The archive scope is the current authenticated user's current project deploy root:

```text
DEPLOY_ROOT/<userPublicId>/<projectId>/
```

This includes artifact directories such as `android/`, `ios/`, `mini-program/`, `prototype/`, and `web/`, plus project files already published through the deployment file publishing flow.

## Non-Goals

- Do not package project source code.
- Do not package `node_modules`, `.git`, local databases, credentials, or workspace files outside deploy.
- Do not package the entire global `DEPLOY_ROOT`.
- Do not allow downloading another user's deploy output.
- Do not replace existing deploy sync or file publishing behavior.

## Recommended Approach

Implement a backend-generated zip archive and expose it through a project-scoped authenticated endpoint:

```http
GET /api/projects/:projectName/deployment/archive
```

The backend resolves the project record from `req.user.id` and `projectName`, then resolves the deploy directory with the existing deployment helpers. The frontend only triggers the download and handles loading and error states.

This approach is safer and more reliable than browser-side `JSZip` because it does not depend on the file tree being expanded, does not duplicate all deploy files through many API calls, and keeps authorization on the server boundary.

## Backend Design

Add an archive helper in `server/services/deployment.js`.

Responsibilities:

- Resolve the deploy root with `getProjectDeployRoot({ userId, projectId })`.
- Verify the directory exists.
- Recursively collect regular files under that root.
- Skip irrelevant system entries such as `.DS_Store`.
- Reject empty deploy roots with a clear error.
- Build a zip archive whose top-level folder is a safe delivery folder name, for example `<project-slug>-delivery/`.
- Preserve relative paths inside the deploy root.

Add a route in `server/routes/projects.js`:

```http
GET /:projectName/deployment/archive
```

Route flow:

1. Resolve the project with `getProjectRecordOrThrow(req.user.id, req.params.projectName)`.
2. Call the archive helper with `req.user.id`, `projectRecord.id`, and a display-friendly project name.
3. Set:
   - `Content-Type: application/zip`
   - `Content-Disposition: attachment; filename="<safe-project-name>-delivery.zip"`
4. Send the zip bytes.

If there is no deployed content, return a `404` client-facing error instead of an empty zip.

## Frontend Design

Add a download action in `MainContentHeader` near the existing deploy or preview controls, because that is where deployment URLs and prototype sync controls already live.

Behavior:

- Show a `Download` icon button with a tooltip or title such as "Download delivery package".
- Disable the button while the archive request is in progress.
- Fetch `/api/projects/<projectName>/deployment/archive` through the authenticated request utility.
- Convert the response to a blob and trigger a browser download.
- On failure, show the returned error message when possible.

The UI should not show instructional text inside the main app. The action can be discoverable through the button title and existing visual placement.

## Data Flow

1. User clicks the delivery download action.
2. Frontend sends an authenticated request to the archive endpoint.
3. Backend validates the user and project.
4. Backend archives only `DEPLOY_ROOT/<userPublicId>/<projectId>/`.
5. Backend returns zip bytes with attachment headers.
6. Browser downloads the zip.

## Error Handling

Expected client-visible failures:

- Project not found: `404`.
- Deploy directory missing or empty: `404` with "No deployed content is available to download".
- Archive generation failure: `500` with a generic message, logging details server-side.

The archive helper must keep path traversal impossible by deriving all paths from trusted deployment helpers and by using relative paths calculated from the resolved deploy root.

## Testing

Add Node test coverage for the backend route:

- Archives only the current project's deploy directory.
- Includes nested files and preserves relative paths.
- Rejects missing or empty deployed content.
- Does not include another user's or another project's deploy output.

Manual verification:

- Publish or create sample deploy files for a project.
- Click the frontend download action.
- Inspect the zip contents and confirm only the current project's deployed files are present.

## Acceptance Criteria

- A logged-in user can download a zip containing the current project's deploy output.
- The zip does not include source files or unrelated deploy directories.
- Empty or missing deploy content returns a clear error.
- Existing deployment sync, file publishing, and public deploy URLs keep working.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass after implementation.
