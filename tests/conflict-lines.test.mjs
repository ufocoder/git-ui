import assert from 'node:assert/strict';
import test from 'node:test';
import { changedLineBlocks, conflictMarkerBlocks } from '../src/lib/conflict-lines.ts';

test('highlights replacements and insertions without marking unchanged shifted lines', () => {
  assert.deepEqual(changedLineBlocks('a\nb\nc\nd\ne\n', 'a\nnew\nc\nd\nlast\n'), [{ start: 1, end: 1 }, { start: 4, end: 4 }]);
  assert.deepEqual(changedLineBlocks('a\nb\nc', 'a\ninserted\nb\nc'), [{ start: 1, end: 1 }]);
  assert.deepEqual(changedLineBlocks('a\nx\nx\nb', 'a\nx\nchanged\nb'), [{ start: 2, end: 2 }]);
});

test('deletions have a navigable anchor, including completely empty results', () => {
  assert.deepEqual(changedLineBlocks('a\nb\nc', 'a\nc'), [{ start: 1, end: 1 }]);
  assert.deepEqual(changedLineBlocks('a', ''), [{ start: 0, end: 0 }]);
  assert.deepEqual(changedLineBlocks('', 'a\nb'), [{ start: 0, end: 1 }]);
  assert.deepEqual(changedLineBlocks('a\r\nb\r\n', 'a\nb\n'), []);
});

test('large separated edits use anchors without highlighting the entire file', () => {
  const lines = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
  const changed = [...lines]; changed[10] = 'first edit'; changed[19000] = 'last edit';
  assert.deepEqual(changedLineBlocks(lines.join('\n'), changed.join('\n')), [{ start: 10, end: 10 }, { start: 19000, end: 19000 }]);
});

test('conflict regions include their markers and incomplete edits remain navigable', () => {
  assert.deepEqual(conflictMarkerBlocks('a\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> incoming\nz'), [{ start: 1, end: 5 }]);
  assert.deepEqual(conflictMarkerBlocks('a\n<<<<<<< HEAD\nunfinished'), [{ start: 1, end: 2 }]);
  assert.deepEqual(conflictMarkerBlocks('resolved'), []);
});
