# Deployment Archive Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped delivery download action that returns a zip containing only the current project's deployed artifacts.

**Architecture:** The server owns archive generation because it already owns deployment path resolution and user/project authorization. The archive helper packages `DEPLOY_ROOT/<userPublicId>/<projectId>/` into a zip buffer, and an authenticated Express route returns it as an attachment. The React header adds a download button that fetches the archive blob and triggers a browser download.

**Tech Stack:** Node.js 22, Express, `node:test`, `jszip`, Vite, React, TypeScript, Tailwind CSS, `react-i18next`, lucide-react.

---

## File Structure

- Modify `server/services/deployment.js`: add `JSZip` import and archive helper functions.
- Modify `server/routes/projects.js`: import the archive helper and add `GET /:projectName/deployment/archive`.
- Modify `server/routes/projects-deployment.test.js`: add integration tests that exercise the HTTP route and inspect the returned zip.
- Modify `src/utils/api.js`: add a small API wrapper for the archive request.
- Modify `src/components/main-content/view/subcomponents/MainContentHeader.tsx`: add download state, handler, and button.
- Modify `src/i18n/locales/en/common.json`: add English labels and errors.
- Modify `src/i18n/locales/zh-CN/common.json`: add Chinese labels and errors.

---

### Task 1: Backend Archive Route Tests

**Files:**
- Modify: `server/routes/projects-deployment.test.js`
- API Test: `server/routes/projects-deployment.test.js`

**API Endpoints:**
- `GET /api/projects/:projectName/deployment/archive` — Download current project's deploy archive.

- [ ] **Step 1: Add zip inspection support to the route integration test**

Modify the imports and `request` helper in `server/routes/projects-deployment.test.js`.

```js
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';
import JSZip from 'jszip';
```

Replace the existing `request` helper with this version:

```js
async function request(app, pathName, options = {}, responseType = 'json') {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathName}`, options);
    const body = responseType === 'buffer'
      ? Buffer.from(await response.arrayBuffer())
      : await response.json().catch(() => ({}));
    return { status: response.status, headers: response.headers, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
```

- [ ] **Step 2: Add the success and isolation integration test**

Append this test inside the existing `describe('project deployment routes', () => { ... })` block:

```js
  test('GET /api/projects/:projectName/deployment/archive downloads only the current project deploy output', async () => {
    const user = userDb.createUser('project-route-archive-user', 'password-hash');
    const otherUser = userDb.createUser('project-route-other-archive-user', 'password-hash');
    const projectPath = path.join(testRoot, 'route-archive-project');
    const otherProjectPath = path.join(testRoot, 'route-other-archive-project');
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(otherProjectPath, { recursive: true });

    const project = userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'route-archive-project',
      projectPath,
      displayName: 'Route Archive Project',
    });
    const otherProject = userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'route-other-archive-project',
      projectPath: otherProjectPath,
      displayName: 'Route Other Archive Project',
    });

    await fs.mkdir(path.join(process.env.DEPLOY_ROOT, user.publicId, String(project.id), 'prototype'), { recursive: true });
    await fs.mkdir(path.join(process.env.DEPLOY_ROOT, user.publicId, String(project.id), 'docs'), { recursive: true });
    await fs.mkdir(path.join(process.env.DEPLOY_ROOT, user.publicId, String(otherProject.id), 'prototype'), { recursive: true });
    await fs.mkdir(path.join(process.env.DEPLOY_ROOT, otherUser.publicId, '99', 'prototype'), { recursive: true });
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, String(project.id), 'prototype', 'index.html'),
      '<h1>Current Prototype</h1>',
    );
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, String(project.id), 'docs', 'handoff.html'),
      '<h1>Handoff</h1>',
    );
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, String(project.id), '.DS_Store'),
      'ignored',
    );
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, user.publicId, String(otherProject.id), 'prototype', 'index.html'),
      '<h1>Wrong Project</h1>',
    );
    await fs.writeFile(
      path.join(process.env.DEPLOY_ROOT, otherUser.publicId, '99', 'prototype', 'index.html'),
      '<h1>Wrong User</h1>',
    );

    const response = await request(
      createApp(user.id),
      '/api/projects/route-archive-project/deployment/archive',
      {},
      'buffer',
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.match(
      response.headers.get('content-disposition') || '',
      /attachment; filename="route-archive-project-delivery\.zip"/,
    );

    const zip = await JSZip.loadAsync(response.body);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
    assert.deepEqual(fileNames, [
      'route-archive-project-delivery/docs/handoff.html',
      'route-archive-project-delivery/prototype/index.html',
    ]);
    assert.equal(
      await zip.file('route-archive-project-delivery/prototype/index.html').async('string'),
      '<h1>Current Prototype</h1>',
    );
  });
```

- [ ] **Step 3: Add the empty deploy integration test**

Append this test inside the same `describe` block:

```js
  test('GET /api/projects/:projectName/deployment/archive rejects missing deployed content', async () => {
    const user = userDb.createUser('project-route-empty-archive-user', 'password-hash');
    const projectPath = path.join(testRoot, 'route-empty-archive-project');
    await fs.mkdir(projectPath, { recursive: true });
    userProjectsDb.upsertProject({
      userId: user.id,
      projectName: 'route-empty-archive-project',
      projectPath,
      displayName: 'Route Empty Archive Project',
    });

    const response = await request(createApp(user.id), '/api/projects/route-empty-archive-project/deployment/archive');

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error, 'No deployed content is available to download');
  });
```

- [ ] **Step 4: Run the route tests to verify RED**

Run:

```bash
npm test -- server/routes/projects-deployment.test.js
```

Expected: fails because `GET /api/projects/:projectName/deployment/archive` does not exist yet. The success test should receive a non-zip response or a 404.

- [ ] **Step 5: Commit failing tests**

```bash
git add server/routes/projects-deployment.test.js
git commit -m "test: cover deployment archive download"
```

---

### Task 2: Backend Archive Implementation

**Files:**
- Modify: `server/services/deployment.js`
- Modify: `server/routes/projects.js`
- Test: `server/routes/projects-deployment.test.js`
- API Test: `server/routes/projects-deployment.test.js`

**API Endpoints:**
- `GET /api/projects/:projectName/deployment/archive` — Download current project's deploy archive.

- [ ] **Step 1: Add JSZip and archive helper code**

In `server/services/deployment.js`, add the import:

```js
import JSZip from 'jszip';
```

Add these helpers near the existing deploy path helper functions:

```js
const DEPLOY_ARCHIVE_SKIPPED_ENTRIES = new Set(['.DS_Store']);

function sanitizeArchiveName(value, fallback = 'deployment') {
  const sanitized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
}

async function addDeployDirectoryToZip({ zip, deployRootPath, currentPath, archiveRootName }) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  let fileCount = 0;

  for (const entry of entries) {
    if (DEPLOY_ARCHIVE_SKIPPED_ENTRIES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(deployRootPath, entryPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      fileCount += await addDeployDirectoryToZip({
        zip,
        deployRootPath,
        currentPath: entryPath,
        archiveRootName,
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const archivePath = `${archiveRootName}/${relativePath}`;
    zip.file(archivePath, await fs.readFile(entryPath));
    fileCount += 1;
  }

  return fileCount;
}
```

Add this exported function after `getProjectDeployRoot`:

```js
export async function generateProjectDeploymentArchive({ userId, projectId, projectName }) {
  const deployRootPath = getProjectDeployRoot({ userId, projectId });
  const archiveBaseName = `${sanitizeArchiveName(projectName || projectId, `project-${projectId}`)}-delivery`;

  try {
    const stats = await fs.stat(deployRootPath);
    if (!stats.isDirectory()) {
      const error = new Error('No deployed content is available to download');
      error.statusCode = 404;
      throw error;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFoundError = new Error('No deployed content is available to download');
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    throw error;
  }

  const zip = new JSZip();
  const fileCount = await addDeployDirectoryToZip({
    zip,
    deployRootPath,
    currentPath: deployRootPath,
    archiveRootName: archiveBaseName,
  });

  if (fileCount === 0) {
    const error = new Error('No deployed content is available to download');
    error.statusCode = 404;
    throw error;
  }

  return {
    buffer: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
    fileName: `${archiveBaseName}.zip`,
    fileCount,
    rootPath: deployRootPath,
  };
}
```

- [ ] **Step 2: Add the archive route**

In `server/routes/projects.js`, extend the deployment import:

```js
import {
  deployProjectArtifact,
  ensureProjectDeployDirectories,
  generateProjectDeploymentArchive,
  getDeployBaseUrl,
  publishProjectFileToDeployment,
} from '../services/deployment.js';
```

Add this route after `GET /:projectName/deployment` and before `POST /:projectName/deployment/sync`:

```js
/**
 * Download the current project's deployed artifacts as a zip archive.
 * GET /api/projects/:projectName/deployment/archive
 */
router.get('/:projectName/deployment/archive', async (req, res) => {
  try {
    const projectRecord = getProjectRecordOrThrow(req.user.id, req.params.projectName);
    const archive = await generateProjectDeploymentArchive({
      userId: req.user.id,
      projectId: projectRecord.id,
      projectName: projectRecord.display_name || projectRecord.project_name || req.params.projectName,
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archive.fileName}"`);
    res.setHeader('Content-Length', String(archive.buffer.length));
    res.send(archive.buffer);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Error generating deployment archive:', error);
    } else {
      console.warn('Rejected deployment archive download:', error.message);
    }
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to generate deployment archive',
    });
  }
});
```

- [ ] **Step 3: Run the route tests to verify GREEN**

Run:

```bash
npm test -- server/routes/projects-deployment.test.js
```

Expected: all tests in `server/routes/projects-deployment.test.js` pass.

- [ ] **Step 4: Commit backend implementation**

```bash
git add server/services/deployment.js server/routes/projects.js server/routes/projects-deployment.test.js
git commit -m "feat: add deployment archive endpoint"
```

---

### Task 3: Frontend API and Translations

**Files:**
- Modify: `src/utils/api.js`
- Modify: `src/i18n/locales/en/common.json`
- Modify: `src/i18n/locales/zh-CN/common.json`

- [ ] **Step 1: Add the frontend API wrapper**

In `src/utils/api.js`, add this method after `getProjectDeployment`:

```js
  downloadProjectDeploymentArchive: (projectName) =>
    authenticatedFetch(`/api/projects/${projectName}/deployment/archive`, {
      method: 'GET',
      headers: {},
    }),
```

- [ ] **Step 2: Add English translations**

In `src/i18n/locales/en/common.json`, add these keys inside `mainContent` after `prototypeOpenFailed`:

```json
    "prototypeOpenFailed": "Failed to open prototype",
    "downloadDeliveryPackage": "Download Delivery Package",
    "downloadingDeliveryPackage": "Downloading...",
    "deliveryDownloadFailed": "Failed to download delivery package"
```

- [ ] **Step 3: Add Chinese translations**

In `src/i18n/locales/zh-CN/common.json`, add these keys inside `mainContent` after `prototypeOpenFailed`:

```json
    "prototypeOpenFailed": "打开原型失败",
    "downloadDeliveryPackage": "下载交付包",
    "downloadingDeliveryPackage": "下载中...",
    "deliveryDownloadFailed": "下载交付包失败"
```

- [ ] **Step 4: Run a JSON and lint sanity check**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en/common.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/locales/zh-CN/common.json','utf8'));"
npm run lint
```

Expected: JSON parsing succeeds silently; lint exits successfully.

- [ ] **Step 5: Commit frontend API and translations**

```bash
git add src/utils/api.js src/i18n/locales/en/common.json src/i18n/locales/zh-CN/common.json
git commit -m "feat: add deployment archive client copy"
```

---

### Task 4: Header Download Button

**Files:**
- Modify: `src/components/main-content/view/subcomponents/MainContentHeader.tsx`

- [ ] **Step 1: Update imports and state**

Change the lucide import:

```tsx
import { Download, ExternalLink, Loader2 } from 'lucide-react';
```

Add state after `prototypeUrl`:

```tsx
  const [isDownloadingArchive, setIsDownloadingArchive] = useState(false);
```

- [ ] **Step 2: Add filename parsing and browser download helpers**

Add these helper functions after `toPublicPrototypeUrl`:

```tsx
function getArchiveFileName(response: Response, fallbackName: string): string {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || fallbackName;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Add the archive download handler**

Add this handler after `handleOpenPrototype`:

```tsx
  const handleDownloadDeliveryPackage = async () => {
    if (!selectedProject?.name || isDownloadingArchive) {
      return;
    }

    setIsDownloadingArchive(true);

    try {
      const response = await api.downloadProjectDeploymentArchive(selectedProject.name);

      if (!response.ok) {
        const payload = await parseDeploymentResponse(response);
        throw new Error(payload.error || t('mainContent.deliveryDownloadFailed'));
      }

      const blob = await response.blob();
      const fallbackName = `${selectedProject.name}-delivery.zip`;
      triggerBrowserDownload(blob, getArchiveFileName(response, fallbackName));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('mainContent.deliveryDownloadFailed');
      window.alert(message);
    } finally {
      setIsDownloadingArchive(false);
    }
  };
```

- [ ] **Step 4: Render the download button in the header**

Replace the existing prototype button block:

```tsx
        {showPrototypeEntry && prototypeUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenPrototype}
            disabled={isOpeningPrototype}
            className="shrink-0"
            title={t('mainContent.openPrototype')}
          >
            {isOpeningPrototype ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            <span className={isMobile ? 'hidden sm:inline' : ''}>
              {isOpeningPrototype ? t('mainContent.openingPrototype') : t('mainContent.openPrototype')}
            </span>
          </Button>
        ) : null}
```

with this block:

```tsx
        {showPrototypeEntry && selectedProject?.name ? (
          <div className="flex shrink-0 items-center gap-2">
            {prototypeUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPrototype}
                disabled={isOpeningPrototype}
                className="shrink-0"
                title={t('mainContent.openPrototype')}
              >
                {isOpeningPrototype ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                <span className={isMobile ? 'hidden sm:inline' : ''}>
                  {isOpeningPrototype ? t('mainContent.openingPrototype') : t('mainContent.openPrototype')}
                </span>
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadDeliveryPackage}
              disabled={isDownloadingArchive}
              className="shrink-0"
              title={t('mainContent.downloadDeliveryPackage')}
            >
              {isDownloadingArchive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className={isMobile ? 'hidden sm:inline' : ''}>
                {isDownloadingArchive
                  ? t('mainContent.downloadingDeliveryPackage')
                  : t('mainContent.downloadDeliveryPackage')}
              </span>
            </Button>
          </div>
        ) : null}
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit header UI**

```bash
git add src/components/main-content/view/subcomponents/MainContentHeader.tsx
git commit -m "feat: add delivery archive download button"
```

---

### Task 5: Final Verification

**Files:**
- Verify: `server/services/deployment.js`
- Verify: `server/routes/projects.js`
- Verify: `server/routes/projects-deployment.test.js`
- Verify: `src/utils/api.js`
- Verify: `src/components/main-content/view/subcomponents/MainContentHeader.tsx`
- Verify: `src/i18n/locales/en/common.json`
- Verify: `src/i18n/locales/zh-CN/common.json`

- [ ] **Step 1: Run focused backend tests**

```bash
npm test -- server/routes/projects-deployment.test.js
```

Expected: all project deployment route tests pass.

- [ ] **Step 2: Run the repository's required checks**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all three commands pass.

- [ ] **Step 3: Manually verify archive behavior**

Run the app:

```bash
npm run dev:restart
```

Manual flow:

1. Open the app in a browser.
2. Select a project that has deploy output under its deployment root.
3. Click "Download Delivery Package".
4. Inspect the zip.
5. Confirm the zip contains paths under `<project-name>-delivery/`.
6. Confirm it contains deployed files such as `prototype/index.html` or published docs.
7. Confirm it does not contain source files, `.git`, `node_modules`, or other project/user deploy directories.

- [ ] **Step 4: Commit any final fixes**

If verification required small fixes, commit them:

```bash
git add server/services/deployment.js server/routes/projects.js server/routes/projects-deployment.test.js src/utils/api.js src/components/main-content/view/subcomponents/MainContentHeader.tsx src/i18n/locales/en/common.json src/i18n/locales/zh-CN/common.json
git commit -m "fix: polish deployment archive download"
```

If no fixes were needed, leave the working tree clean.

---

## Self-Review

- Spec coverage: Task 2 implements the backend-generated archive endpoint. Task 1 covers route integration behavior, deploy root isolation, nested paths, skipped `.DS_Store`, and missing content. Tasks 3 and 4 implement the frontend trigger. Task 5 covers required verification.
- Placeholder scan: no placeholder markers or unspecified test steps remain.
- Type consistency: `generateProjectDeploymentArchive`, `downloadProjectDeploymentArchive`, `handleDownloadDeliveryPackage`, and translation keys are used consistently across tasks.
- API coverage: the new `GET /api/projects/:projectName/deployment/archive` endpoint has integration tests in `server/routes/projects-deployment.test.js` for success, authorization-by-project-scope through user/project path isolation, and missing deployed content.
