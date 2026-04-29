import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('English chat empty state names Codex as the default provider', async () => {
  const chatLocale = JSON.parse(
    await fs.readFile(new URL('./chat.json', import.meta.url), 'utf8'),
  );

  assert.equal(chatLocale.providerSelection.title, 'Codex');
  assert.equal(
    chatLocale.providerSelection.description,
    'Codex is selected by default. Start typing below.',
  );
});
