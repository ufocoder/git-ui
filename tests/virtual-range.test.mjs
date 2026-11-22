import assert from 'node:assert/strict';
import test from 'node:test';
import { virtualRange } from '../src/lib/virtual-range.ts';

test('scrolling huge files stays bounded at top, middle, end and after resizing', () => {
  for (const count of [0, 3, 10000, 1000000]) for (const top of [0, 8000, count * 16 - 300]) {
    const range = virtualRange(count, top, 320, 16);
    assert.ok(range.start >= 0 && range.end <= count && range.end >= range.start);
    assert.ok(range.end - range.start <= 36);
  }
  const short = virtualRange(10000, 8000, 160, 16), tall = virtualRange(10000, 8000, 640, 16);
  assert.equal(short.start, tall.start);
  assert.ok(tall.end > short.end);
});

