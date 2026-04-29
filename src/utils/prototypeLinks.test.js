import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectLink, resolvePrototypeLinkHref } from './prototypeLinks.js';

const project = {
  id: 4,
  fullPath: '/Users/jon/workspace/users/usr_FVpeE5JQZuaOkldc/7HxpJI3fM26RW3BZrCeamIKV',
  path: '/Users/jon/workspace/users/usr_FVpeE5JQZuaOkldc/7HxpJI3fM26RW3BZrCeamIKV',
};

const location = {
  hostname: 'cx.incomify.com',
  origin: 'https://cx.incomify.com',
};

test('rewrites current project prototype file paths to the public deploy URL', () => {
  const href = '/Users/jon/workspace/users/usr_FVpeE5JQZuaOkldc/7HxpJI3fM26RW3BZrCeamIKV/prototype/index.html';

  assert.equal(
    resolvePrototypeLinkHref(href, { project, location }),
    'https://cx.incomify.com/aisoft/deploy/usr_FVpeE5JQZuaOkldc/4/prototype/index.html',
  );
});

test('rewrites relative prototype links when the selected project has a deploy identity', () => {
  assert.equal(
    resolvePrototypeLinkHref('prototype/index.html', { project, location }),
    'https://cx.incomify.com/aisoft/deploy/usr_FVpeE5JQZuaOkldc/4/prototype/index.html',
  );
});

test('leaves unrelated links unchanged', () => {
  assert.equal(
    resolvePrototypeLinkHref('/Users/jon/other/prototype/index.html', { project, location }),
    '/Users/jon/other/prototype/index.html',
  );
});

test('rewrites current project document paths to the public deploy URL', () => {
  const href = 'https://cx.incomify.com/Users/jon/workspace/users/usr_FVpeE5JQZuaOkldc/7HxpJI3fM26RW3BZrCeamIKV/docs/test-report.md';

  assert.deepEqual(
    resolveProjectLink(href, { project, location }),
    {
      href: 'https://cx.incomify.com/aisoft/deploy/usr_FVpeE5JQZuaOkldc/4/docs/test-report.html',
      shouldPublish: true,
      sourcePath: '/Users/jon/workspace/users/usr_FVpeE5JQZuaOkldc/7HxpJI3fM26RW3BZrCeamIKV/docs/test-report.md',
    },
  );
});
