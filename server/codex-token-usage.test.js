import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCodexTokenUsageFromInfo,
  extractCodexTokenUsageFromTurnUsage,
} from './codex-token-usage.js';

test('uses latest Codex turn usage instead of cumulative session usage', () => {
  const tokenUsage = extractCodexTokenUsageFromInfo({
    total_token_usage: {
      input_tokens: 2515266,
      output_tokens: 29992,
      total_tokens: 2545258,
    },
    last_token_usage: {
      input_tokens: 53091,
      output_tokens: 115,
      total_tokens: 53206,
    },
    model_context_window: 258400,
  });

  assert.deepEqual(tokenUsage, {
    used: 53206,
    total: 258400,
    totalUsed: 2545258,
    cumulativeInputTokens: 2515266,
    cumulativeOutputTokens: 29992,
  });
});

test('falls back to cumulative Codex usage when latest turn usage is absent', () => {
  const tokenUsage = extractCodexTokenUsageFromInfo({
    total_token_usage: {
      input_tokens: 1000,
      output_tokens: 200,
      total_tokens: 1200,
    },
    model_context_window: 522500,
  });

  assert.deepEqual(tokenUsage, {
    used: 1200,
    total: 522500,
  });
});

test('normalizes streamed Codex turn usage', () => {
  const tokenUsage = extractCodexTokenUsageFromTurnUsage({
    input_tokens: 250000,
    output_tokens: 1000,
    model_context_window: 258400,
  });

  assert.deepEqual(tokenUsage, {
    used: 251000,
    total: 258400,
  });
});
