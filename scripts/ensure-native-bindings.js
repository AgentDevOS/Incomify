#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);

const NATIVE_PACKAGES = [
  {
    name: 'sqlite3',
    bindingRelativePath: path.join('build', 'Release', 'node_sqlite3.node'),
  },
  {
    name: 'better-sqlite3',
    bindingRelativePath: path.join('build', 'Release', 'better_sqlite3.node'),
  },
];

function resolvePackageDir(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return path.dirname(packageJsonPath);
}

function getMissingPackages() {
  const missing = [];

  for (const pkg of NATIVE_PACKAGES) {
    try {
      const packageDir = resolvePackageDir(pkg.name);
      const bindingPath = path.join(packageDir, pkg.bindingRelativePath);

      if (!fs.existsSync(bindingPath)) {
        missing.push(pkg.name);
      }
    } catch (error) {
      console.warn(`[postinstall] Skipping ${pkg.name}: ${error.message}`);
    }
  }

  return missing;
}

function runPackageManager(args) {
  const packageManagerExec = process.env.npm_execpath;

  if (packageManagerExec && /\.(cjs|mjs|js)$/.test(packageManagerExec)) {
    return spawnSync(process.execPath, [packageManagerExec, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
  }

  return spawnSync(packageManagerExec || 'npm', args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
  });
}

function ensureNativeBindings() {
  const missingBeforeRebuild = getMissingPackages();

  if (missingBeforeRebuild.length === 0) {
    console.log('[postinstall] Native SQLite bindings are present');
    return;
  }

  console.log(`[postinstall] Missing native bindings for: ${missingBeforeRebuild.join(', ')}`);
  console.log('[postinstall] Rebuilding native SQLite packages...');

  const rebuildResult = runPackageManager(['rebuild', ...missingBeforeRebuild]);

  if (rebuildResult.status !== 0) {
    process.exit(rebuildResult.status ?? 1);
  }

  const missingAfterRebuild = getMissingPackages();

  if (missingAfterRebuild.length > 0) {
    console.error(
      `[postinstall] Native bindings are still missing after rebuild: ${missingAfterRebuild.join(', ')}`
    );
    process.exit(1);
  }

  console.log('[postinstall] Native SQLite bindings verified');
}

ensureNativeBindings();
