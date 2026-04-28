import path from 'path';
import { promises as fs } from 'fs';
import { db, projectBackendsDb } from '../database/db.js';

const DEFAULT_PORT_START = 41000;
const DEFAULT_PORT_END = 41999;

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }

  return parsed;
}

function getPortRange() {
  const start = parsePort(process.env.PROJECT_BACKEND_PORT_START, DEFAULT_PORT_START);
  const end = parsePort(process.env.PROJECT_BACKEND_PORT_END, DEFAULT_PORT_END);

  if (end < start) {
    return { start: DEFAULT_PORT_START, end: DEFAULT_PORT_END };
  }

  return { start, end };
}

function formatBackend(row) {
  if (!row) {
    return null;
  }

  return {
    language: row.language,
    port: row.port,
    path: row.backend_path,
  };
}

function allocateBackendRecord(projectId, backendPath) {
  const existingBackend = projectBackendsDb.getBackendForProject(projectId);
  if (existingBackend) {
    return existingBackend;
  }

  const allocate = db.transaction(() => {
    const { start, end } = getPortRange();
    const usedPorts = new Set(projectBackendsDb.getUsedPorts());

    for (let port = start; port <= end; port += 1) {
      if (usedPorts.has(port)) {
        continue;
      }

      try {
        return projectBackendsDb.createBackend({
          projectId,
          language: 'rust',
          port,
          backendPath,
        });
      } catch (error) {
        if (error.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
          throw error;
        }
      }
    }

    throw new Error(`No available project backend ports in range ${start}-${end}`);
  });

  return allocate();
}

async function writeFileIfAbsent(filePath, content) {
  try {
    await fs.writeFile(filePath, content, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

function buildCargoToml() {
  return `[package]
name = "incomify-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
dotenvy = "0.15"
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
`;
}

function buildMainRs() {
  return `use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::{env, net::SocketAddr};

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok"
    }))
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let port = env::var("BACKEND_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(41000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let app = Router::new().route("/health", get(health));

    println!("Rust backend listening on http://{addr}");
    // GET /health
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind backend listener");

    axum::serve(listener, app)
        .await
        .expect("backend server failed");
}
`;
}

async function writeRustBackendTemplate(backendPath, port) {
  const rustSourcePath = path.join(backendPath, 'src');

  await fs.mkdir(rustSourcePath, { recursive: true });
  await writeFileIfAbsent(path.join(backendPath, '.env'), `BACKEND_PORT=${port}\n`);
  await writeFileIfAbsent(path.join(backendPath, 'Cargo.toml'), buildCargoToml());
  await writeFileIfAbsent(path.join(rustSourcePath, 'main.rs'), buildMainRs());
}

export async function provisionRustBackendForProject({ projectId, projectPath }) {
  if (projectId == null) {
    throw new Error('Project id is required for Rust backend provisioning');
  }

  if (!projectPath?.trim()) {
    throw new Error('Project path is required for Rust backend provisioning');
  }

  const backendPath = path.join(path.resolve(projectPath), 'src', 'backend');
  const backendRecord = allocateBackendRecord(projectId, backendPath);
  await writeRustBackendTemplate(backendPath, backendRecord.port);

  return formatBackend(backendRecord);
}

export function getProjectBackend(projectId) {
  return formatBackend(projectBackendsDb.getBackendForProject(projectId));
}
