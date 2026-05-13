'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  discoverBackendApiPaths,
  syncBackendApiPaths,
} = require('./workflow/sync-backend-api-paths');

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function withTempProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-backend-api-paths-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function rustBackendSource() {
  return [
    'use axum::{Router, routing::{delete, get, post, put}};',
    '',
    'pub fn app() -> Router {',
    '    Router::new()',
    '        .route("/health", get(health))',
    '        .nest("/api", api_routes())',
    '}',
    '',
    'fn api_routes() -> Router {',
    '    Router::new()',
    '        .route("/todos", get(list_todos).post(create_todo))',
    '        .route("/todos/{id}", put(update_todo).delete(delete_todo))',
    '}',
    '',
    'async fn health() {}',
    'async fn list_todos() {}',
    'async fn create_todo() {}',
    'async fn update_todo() {}',
    'async fn delete_todo() {}',
    '',
  ].join('\n');
}

withTempProject(root => {
  writeFile(root, 'src/backend/src/main.rs', rustBackendSource());

  const routes = discoverBackendApiPaths(root);

  assert.deepStrictEqual(routes, [
    { method: 'GET', path: '/api/todos' },
    { method: 'POST', path: '/api/todos' },
    { method: 'DELETE', path: '/api/todos/{id}' },
    { method: 'PUT', path: '/api/todos/{id}' },
    { method: 'GET', path: '/health' },
  ]);
});

withTempProject(root => {
  writeFile(root, 'src/backend/src/main.rs', rustBackendSource());
  writeFile(root, '.workflow/test-contract.json', JSON.stringify({
    version: 1,
    implementationType: 'web',
    deliveryTargets: ['web'],
    e2e: {
      frameworks: ['playwright'],
      minimumRealE2ECount: 1,
      requiredRealE2EScenarios: ['core_happy_path'],
    },
  }, null, 2) + '\n');

  const result = syncBackendApiPaths(root);
  const contract = readJson(root, '.workflow/test-contract.json');

  assert.strictEqual(result.updated, true);
  assert.deepStrictEqual(contract.backend, {
    language: 'rust',
    framework: 'axum',
    database: 'sqlite',
    apiPaths: [
      { method: 'GET', path: '/api/todos' },
      { method: 'POST', path: '/api/todos' },
      { method: 'DELETE', path: '/api/todos/{id}' },
      { method: 'PUT', path: '/api/todos/{id}' },
      { method: 'GET', path: '/health' },
    ],
  });
});

console.log('sync-backend-api-paths tests passed');
