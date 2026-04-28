import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import express from 'express';

const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incomify-auth-'));
process.env.DATABASE_PATH = path.join(testDbDir, 'auth.test.db');
process.env.JWT_SECRET = 'auth-test-secret';
process.env.REGISTRATION_INVITE_CODE = 'let-me-in';

const { default: authRoutes } = await import('./auth.js');
const { initializeDatabase, db } = await import('../database/db.js');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function request(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  return { response, payload };
}

describe('auth routes', () => {
  let server;
  let baseUrl;

  before(async () => {
    await initializeDatabase();
    ({ server, baseUrl } = await listen(createTestApp()));
  });

  beforeEach(() => {
    db.prepare('DELETE FROM users').run();
  });

  after(() => {
    server?.close();
    db.close();
    fs.rmSync(testDbDir, { recursive: true, force: true });
  });

  test('registers and logs in a user with email and a valid invite code', async () => {
    const registration = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'alice@example.com',
      password: 'correct-horse',
      inviteCode: 'let-me-in',
    });

    assert.equal(registration.response.status, 200);
    assert.equal(registration.payload.success, true);
    assert.equal(registration.payload.user.email, 'alice@example.com');
    assert.equal(typeof registration.payload.token, 'string');

    const login = await request(baseUrl, 'POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'correct-horse',
    });

    assert.equal(login.response.status, 200);
    assert.equal(login.payload.success, true);
    assert.equal(login.payload.user.email, 'alice@example.com');
    assert.equal(typeof login.payload.token, 'string');
  });

  test('allows multiple users to register when each provides the invite code', async () => {
    const first = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'first@example.com',
      password: 'correct-horse',
      inviteCode: 'let-me-in',
    });
    const second = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'second@example.com',
      password: 'correct-horse',
      inviteCode: 'let-me-in',
    });

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.notEqual(first.payload.user.id, second.payload.user.id);
  });

  test('rejects registration without the configured invite code', async () => {
    const result = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'alice@example.com',
      password: 'correct-horse',
      inviteCode: 'wrong-code',
    });

    assert.equal(result.response.status, 403);
    assert.match(result.payload.error, /invite/i);
  });

  test('rejects invalid email addresses during registration', async () => {
    const result = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'not-an-email',
      password: 'correct-horse',
      inviteCode: 'let-me-in',
    });

    assert.equal(result.response.status, 400);
    assert.match(result.payload.error, /email/i);
  });

  test('rejects duplicate email registrations', async () => {
    await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'alice@example.com',
      password: 'correct-horse',
      inviteCode: 'let-me-in',
    });

    const duplicate = await request(baseUrl, 'POST', '/api/auth/register', {
      email: 'alice@example.com',
      password: 'another-password',
      inviteCode: 'let-me-in',
    });

    assert.equal(duplicate.response.status, 409);
    assert.match(duplicate.payload.error, /email/i);
  });
});
