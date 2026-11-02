import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff, diffRows } from "../src/lib/diff.ts";

test("diff numbering follows hunks, insertions, deletions and newline markers", () => {
  const parsed = parseDiff("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -10,2 +20,2 @@ function\n old\n-gone\n+new\n\\ No newline at end of file\n@@ -0,0 +1,2 @@\n+first\n+second\n");
  assert.equal(parsed.hunks.length, 2);
  assert.deepEqual(parsed.hunks[0].lines.map(line => [line.kind, line.oldLine, line.newLine]), [["context", 10, 20], ["remove", 11, null], ["add", null, 21], ["meta", null, null]]);
  assert.deepEqual(parsed.hunks[1].lines.map(line => [line.oldLine, line.newLine]), [[null, 1], [null, 2]]);
  assert.equal(parsed.hunks[0].lines[2].text, "new");
});

test("split view pairs replacement blocks and preserves unmatched lines", () => {
  const parsed = parseDiff("@@ -1,3 +1,2 @@\n-a\n-b\n+c\n stable\n");
  const rows = diffRows(parsed, true, false, new Set()).filter(row => row.kind === "line");
  assert.deepEqual(rows.map(row => [row.left?.text ?? null, row.right?.text ?? null]), [["a", "c"], ["b", null], ["stable", "stable"]]);
});

test("context folding preserves all changes and can expand a specific block", () => {
  const parsed = parseDiff("@@ -1,13 +1,13 @@\n" + Array.from({ length: 12 }, (_, index) => ` line ${index}\n`).join("") + "-old\n+new\n");
  const collapsed = diffRows(parsed, false, true, new Set());
  const fold = collapsed.find(row => row.kind === "fold");
  assert.equal(fold.count, 6);
  assert.equal(collapsed.filter(row => row.kind === "line").length, 8);
  const expanded = diffRows(parsed, false, true, new Set([fold.id]));
  assert.equal(expanded.filter(row => row.kind === "line").length, 14);
  assert.equal(expanded.some(row => row.kind === "fold"), false);
});

test("binary and metadata-only patches remain available without invented text rows", () => {
  const patch = "diff --git a/image b/image\nBinary files a/image and b/image differ\n";
  const parsed = parseDiff(patch);
  assert.equal(parsed.hunks.length, 0);
  assert.ok(parsed.metadata[1].startsWith("Binary files"));
});
