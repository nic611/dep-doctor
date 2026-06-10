import { test } from 'node:test';
import assert from 'node:assert';
import { parse, satisfies } from '../src/infra/semver-lite.js';

test('parse: extracts major/minor/patch', () => {
  assert.deepStrictEqual(parse('18.3.1'), { major: 18, minor: 3, patch: 1 });
  assert.deepStrictEqual(parse('v2.0.0'), { major: 2, minor: 0, patch: 0 });
  assert.strictEqual(parse('not-a-version'), null);
});

test('satisfies: caret ranges', () => {
  assert.strictEqual(satisfies('18.3.1', '^18.0.0'), true);
  assert.strictEqual(satisfies('19.0.0', '^18.0.0'), false);
});

test('satisfies: union and wildcard', () => {
  assert.strictEqual(satisfies('16.14.0', '^16.8.0 || ^17.0.0'), true);
  assert.strictEqual(satisfies('18.3.1', '*'), true);
});
