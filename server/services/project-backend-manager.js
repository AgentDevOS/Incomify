import { spawn } from 'child_process';
import chokidar from 'chokidar';
import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';

const DEFAULT_START_TIMEOUT_MS = 60_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 500;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_REBUILD_DEBOUNCE_MS = 1_500;
const MAX_LOG_CHARS = 8_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function appendLog(current, chunk) {
  const next = `${current}${chunk}`;
  return next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next;
}

function getProjectRootFromBackendPath(backendPath) {
  return path.resolve(backendPath, '..', '..');
}

export function parseCargoPackageName(cargoToml) {
  const packageSectionMatch = /^\[package\]([\s\S]*?)(?=^\[|\s*$)/m.exec(cargoToml);
  const packageSection = packageSectionMatch?.[1] || cargoToml;
  const nameMatch = /^\s*name\s*=\s*"([^"]+)"/m.exec(packageSection);
  return nameMatch?.[1] || null;
}

async function getBackendBinaryPath(backendPath) {
  const cargoToml = await fs.readFile(path.join(backendPath, 'Cargo.toml'), 'utf8');
  const packageName = parseCargoPackageName(cargoToml);
  if (!packageName) {
    throw new Error('Cargo.toml is missing package.name');
  }

  const executableName = process.platform === 'win32' ? `${packageName}.exe` : packageName;
  return path.join(backendPath, 'target', 'debug', executableName);
}

function createHealthChecker({ requestImpl = http.request, healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
  return function checkHealth(port) {
    return new Promise((resolve) => {
      const req = requestImpl(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health',
          method: 'GET',
          timeout: healthTimeoutMs,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        },
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  };
}

export function createProjectBackendManager({
  spawnImpl = spawn,
  watchImpl = chokidar.watch,
  checkHealth = createHealthChecker(),
  startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  rebuildDebounceMs = DEFAULT_REBUILD_DEBOUNCE_MS,
  logger = console,
} = {}) {
  const processes = new Map();

  function keyForBackend(backend) {
    return `${backend.path}:${backend.port}`;
  }

  function publicStatus(backend, state = null) {
    const running = state?.status === 'running' || state?.status === 'external';
    return {
      language: backend.language,
      port: backend.port,
      path: backend.path,
      url: `http://127.0.0.1:${backend.port}`,
      running,
      managed: state?.status === 'running' || state?.status === 'starting',
      status: state?.status || 'stopped',
      lastError: state?.lastError || null,
      logs: state?.logs || '',
      watching: Boolean(state?.watcher),
      buildStatus: state?.buildStatus || 'idle',
    };
  }

  function waitForProcess(child) {
    return new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        resolve(code);
      });
    });
  }

  async function runCargoBuild(backend, state) {
    const manifestPath = path.join(backend.path, 'Cargo.toml');
    const projectRoot = getProjectRootFromBackendPath(backend.path);

    state.buildStatus = 'building';
    state.logs = appendLog(state.logs, `\n[Incomify] Building Rust backend on port ${backend.port}\n`);

    const child = spawnImpl('cargo', ['build', '--manifest-path', manifestPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        BACKEND_PORT: String(backend.port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      state.logs = appendLog(state.logs, data.toString());
    });
    child.stderr?.on('data', (data) => {
      state.logs = appendLog(state.logs, data.toString());
    });

    const code = await waitForProcess(child);
    if (code !== 0) {
      state.buildStatus = 'failed';
      throw new Error(`Rust backend build failed with exit code ${code}`);
    }

    state.buildStatus = 'built';
    return getBackendBinaryPath(backend.path);
  }

  async function waitForHealthy(backend, state, child) {
    const deadline = Date.now() + startTimeoutMs;

    while (Date.now() < deadline) {
      if (await checkHealth(backend.port)) {
        state.status = 'running';
        state.lastError = null;
        return publicStatus(backend, state);
      }

      if (child.exitCode != null) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    state.status = 'failed';
    state.lastError = child.exitCode == null
      ? `Backend did not become healthy within ${startTimeoutMs}ms`
      : `Backend process exited with code ${child.exitCode}`;
    if (child.exitCode == null) {
      child.kill('SIGTERM');
    }
    throw new Error(state.lastError);
  }

  function stopProcess(state) {
    if (state.process && state.process.exitCode == null) {
      const child = state.process;
      state.status = 'stopping';
      child.kill('SIGTERM');
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    state.process = null;
    return Promise.resolve();
  }

  async function launchBuiltBackend(backend, state, binaryPath) {
    const projectRoot = getProjectRootFromBackendPath(backend.path);
    const child = spawnImpl(binaryPath, [], {
      cwd: projectRoot,
      env: {
        ...process.env,
        BACKEND_PORT: String(backend.port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.process = child;
    state.status = 'starting';
    state.lastError = null;
    state.logs = appendLog(state.logs, `\n[Incomify] Launching Rust backend: ${binaryPath}\n`);

    child.stdout?.on('data', (data) => {
      state.logs = appendLog(state.logs, data.toString());
    });
    child.stderr?.on('data', (data) => {
      state.logs = appendLog(state.logs, data.toString());
    });
    child.on('error', (error) => {
      state.status = 'failed';
      state.lastError = error.message;
      logger.error?.('[ProjectBackend] Failed to launch backend:', error);
    });
    child.on('close', (code) => {
      if (state.status === 'stopping') {
        return;
      }

      if (state.process === child) {
        state.process = null;
        state.status = 'stopped';
        state.lastError = code === 0 ? null : `Backend process exited with code ${code}`;
      }
    });

    return waitForHealthy(backend, state, child);
  }

  async function rebuildAndRestart(backend, state) {
    if (state.buildStatus === 'building' || state.restarting) {
      state.restartPending = true;
      return state.startPromise || publicStatus(backend, state);
    }

    state.restarting = true;
    state.restartPending = false;

    try {
      const binaryPath = await runCargoBuild(backend, state);
      await stopProcess(state);
      await launchBuiltBackend(backend, state, binaryPath);
    } catch (error) {
      state.status = state.process?.exitCode == null && state.process ? 'running' : 'failed';
      state.lastError = error.message;
      state.logs = appendLog(state.logs, `\n[Incomify] ${error.message}\n`);
      logger.warn?.('[ProjectBackend] Rust backend rebuild failed:', error.message);
    } finally {
      state.restarting = false;
      if (state.restartPending) {
        scheduleRestart(backend, state);
      }
    }

    if (state?.status === 'external') {
      processes.delete(key);
      return publicStatus(backend, null);
    }

    return publicStatus(backend, state);
  }

  function scheduleRestart(backend, state) {
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
    }

    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      rebuildAndRestart(backend, state).catch((error) => {
        state.lastError = error.message;
        logger.warn?.('[ProjectBackend] Rust backend hot restart failed:', error.message);
      });
    }, rebuildDebounceMs);
  }

  function ensureWatcher(backend, state) {
    if (state.watcher || watchImpl == null) {
      return;
    }

    const watchTargets = [
      path.join(backend.path, 'Cargo.toml'),
      path.join(backend.path, 'src'),
    ];

    const watcher = watchImpl(watchTargets, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      ignored: [
        '**/target/**',
        '**/.git/**',
      ],
    });

    const onChange = () => {
      state.logs = appendLog(state.logs, '\n[Incomify] Rust backend change detected; scheduling rebuild\n');
      scheduleRestart(backend, state);
    };

    watcher.on('add', onChange);
    watcher.on('change', onChange);
    watcher.on('unlink', onChange);
    watcher.on('error', (error) => {
      state.logs = appendLog(state.logs, `\n[Incomify] Watcher error: ${error.message}\n`);
      logger.warn?.('[ProjectBackend] Watcher error:', error.message);
    });

    state.watcher = watcher;
  }

  async function ensureRunning(backend) {
    if (!backend?.path || !backend?.port) {
      throw new Error('Project backend metadata is missing');
    }

    if (backend.language !== 'rust') {
      throw new Error(`Unsupported project backend language: ${backend.language}`);
    }

    const key = keyForBackend(backend);
    const existing = processes.get(key);
    if (existing?.status === 'running' && existing.process.exitCode == null) {
      ensureWatcher(backend, existing);
      return publicStatus(backend, existing);
    }

    if (existing?.status === 'starting' && existing.startPromise) {
      return existing.startPromise;
    }

    if (await checkHealth(backend.port)) {
      const externalState = {
        status: 'external',
        lastError: null,
        logs: '',
        buildStatus: 'idle',
      };
      processes.set(key, externalState);
      return publicStatus(backend, externalState);
    }

    const manifestPath = path.join(backend.path, 'Cargo.toml');
    await fs.access(manifestPath);

    const state = {
      status: 'starting',
      process: null,
      lastError: null,
      logs: '',
      buildStatus: 'idle',
      restartPending: false,
      restarting: false,
      restartTimer: null,
      watcher: null,
      startPromise: null,
    };
    processes.set(key, state);
    ensureWatcher(backend, state);

    state.startPromise = (async () => {
      try {
        const binaryPath = await runCargoBuild(backend, state);
        const status = await launchBuiltBackend(backend, state, binaryPath);
        ensureWatcher(backend, state);
        return status;
      } catch (error) {
        state.status = 'failed';
        state.lastError = error.message;
        state.startPromise = null;
        processes.delete(key);
        throw error;
      }
    })();
    return state.startPromise;
  }

  async function getStatus(backend) {
    if (!backend?.path || !backend?.port) {
      throw new Error('Project backend metadata is missing');
    }

    const key = keyForBackend(backend);
    const state = processes.get(key);
    if (await checkHealth(backend.port)) {
      if (!state) {
        const externalState = {
          status: 'external',
          lastError: null,
          logs: '',
          buildStatus: 'idle',
        };
        processes.set(key, externalState);
        return publicStatus(backend, externalState);
      }

      if (state.status !== 'starting') {
        state.status = state.process ? 'running' : 'external';
      }
      return publicStatus(backend, state);
    }

    return publicStatus(backend, state);
  }

  async function stop(backend) {
    if (!backend?.path || !backend?.port) {
      throw new Error('Project backend metadata is missing');
    }

    const key = keyForBackend(backend);
    const state = processes.get(key);
    if (state?.restartTimer) {
      clearTimeout(state.restartTimer);
    }
    await state?.watcher?.close?.();

    if (!state?.process || state.process.exitCode != null) {
      processes.delete(key);
      return publicStatus(backend, null);
    }

    state.status = 'stopping';
    state.process.kill('SIGTERM');
    processes.delete(key);
    return publicStatus(backend, null);
  }

  return {
    ensureRunning,
    getStatus,
    stop,
  };
}

export const projectBackendManager = createProjectBackendManager();
