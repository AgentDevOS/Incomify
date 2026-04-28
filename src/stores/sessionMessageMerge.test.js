import assert from 'node:assert/strict';
import test from 'node:test';
import { computeMergedMessages } from './sessionMessageMerge.js';

const logger = {
  log() {},
};

function textMessage(overrides = {}) {
  return {
    id: 'message-id',
    sessionId: 'session-id',
    provider: 'codex',
    kind: 'text',
    role: 'assistant',
    content: 'message content',
    timestamp: '2026-04-28T10:46:41.183Z',
    ...overrides,
  };
}

test('drops realtime assistant text that already exists in server history with a different id', () => {
  const server = [
    textMessage({
      id: 'server-final-answer',
      content: '每条 Todo 需要包含哪些内容，请回复数字：\n\n1. 只有标题文本',
    }),
  ];
  const realtime = [
    textMessage({
      id: 'realtime-final-answer',
      content: '每条 Todo 需要包含哪些内容，请回复数字：\n1. 只有标题文本',
      timestamp: '2026-04-28T10:46:42.000Z',
    }),
  ];

  const merged = computeMergedMessages(server, realtime, logger);

  assert.deepEqual(merged.map((message) => message.id), ['server-final-answer']);
});

test('keeps realtime assistant text when content is different', () => {
  const server = [textMessage({ id: 'server-answer', content: 'first answer' })];
  const realtime = [textMessage({ id: 'realtime-answer', content: 'second answer' })];

  const merged = computeMergedMessages(server, realtime, logger);

  assert.deepEqual(merged.map((message) => message.id), ['server-answer', 'realtime-answer']);
});
