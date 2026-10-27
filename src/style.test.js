import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MAX_FUNCTION_LINES = 20;

const sources = readdirSync(new URL('.', import.meta.url))
  .filter((name) => name.endsWith('.js') && !name.includes('.test.') && name !== 'test-helpers.js')
  .map((name) => ({ name, lines: readFileSync(new URL(name, import.meta.url), 'utf8').split('\n') }));

function topLevelFunctions(lines) {
  const found = [];
  let start = null;
  lines.forEach((line, i) => {
    if (/^(export )?(async )?function /.test(line)) start = i;
    if (line === '}' && start !== null) {
      found.push({ header: lines[start], length: i - start + 1 });
      start = null;
    }
  });
  return found;
}

test('top-level functions stay short', () => {
  for (const { name, lines } of sources) {
    for (const fn of topLevelFunctions(lines)) {
      assert.ok(fn.length <= MAX_FUNCTION_LINES, `${name}: ${fn.header} is ${fn.length} lines`);
    }
  }
});

test('source has no comments', () => {
  for (const { name, lines } of sources) {
    const comment = lines.findIndex((line) => /^\s*(\/\/|\/\*)/.test(line));
    assert.equal(comment, -1, `${name}:${comment + 1}`);
  }
});
