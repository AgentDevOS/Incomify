const DEFAULT_CODEX_CONTEXT_WINDOW = 200000;

function getTokenTotal(usage) {
  if (!usage || typeof usage !== 'object') return 0;

  if (Number.isFinite(usage.total_tokens)) return usage.total_tokens;

  const inputTokens = Number.isFinite(usage.input_tokens) ? usage.input_tokens : 0;
  const outputTokens = Number.isFinite(usage.output_tokens) ? usage.output_tokens : 0;
  return inputTokens + outputTokens;
}

function getTokenParts(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = Number.isFinite(usage.input_tokens) ? usage.input_tokens : 0;
  const outputTokens = Number.isFinite(usage.output_tokens) ? usage.output_tokens : 0;
  const totalTokens = getTokenTotal(usage);

  return { inputTokens, outputTokens, totalTokens };
}

export function extractCodexTokenUsageFromInfo(info) {
  if (!info || typeof info !== 'object') return null;

  const turnUsage = info.last_token_usage || info.total_token_usage || null;
  const used = getTokenTotal(turnUsage);
  const total = Number.isFinite(info.model_context_window)
    ? info.model_context_window
    : DEFAULT_CODEX_CONTEXT_WINDOW;

  const tokenUsage = { used, total };
  if (info.last_token_usage && info.total_token_usage) {
    const cumulativeUsage = getTokenParts(info.total_token_usage);
    if (cumulativeUsage) {
      tokenUsage.totalUsed = cumulativeUsage.totalTokens;
      tokenUsage.cumulativeInputTokens = cumulativeUsage.inputTokens;
      tokenUsage.cumulativeOutputTokens = cumulativeUsage.outputTokens;
    }
  }

  return tokenUsage;
}

export function extractCodexTokenUsageFromTurnUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const used = getTokenTotal(usage);
  const total = Number.isFinite(usage.model_context_window)
    ? usage.model_context_window
    : DEFAULT_CODEX_CONTEXT_WINDOW;

  return { used, total };
}
