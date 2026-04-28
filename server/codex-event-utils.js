export function getCodexEventThreadId(event) {
  return event?.thread_id || event?.threadId || event?.id || null;
}
