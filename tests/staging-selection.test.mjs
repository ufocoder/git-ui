import assert from "node:assert/strict";
import test from "node:test";
import { stagingSelection, hasDiffScope, selectDiffScope, stageSelectedFiles } from "../src/features/changes/staging-selection.ts";
const unstaged = { staged: false, partially_staged: false };
const staged = { staged: true, partially_staged: false };
const partial = { staged: true, partially_staged: true };

test("selection distinguishes empty, unstaged, staged and mixed directories", () => {
  assert.deepEqual(stagingSelection([]), { checked: false, indeterminate: false });
  assert.deepEqual(stagingSelection([unstaged]), { checked: false, indeterminate: false });
  assert.deepEqual(stagingSelection([staged, staged]), { checked: true, indeterminate: false });
  assert.deepEqual(stagingSelection([staged, unstaged]), { checked: false, indeterminate: true });
  assert.deepEqual(stagingSelection([partial]), { checked: false, indeterminate: true });
});

test("partial files expose both diffs and preserve an explicit choice", () => {
  assert.ok(hasDiffScope([partial], "staged"));
  assert.ok(hasDiffScope([partial], "unstaged"));
  assert.equal(selectDiffScope([partial]), "unstaged");
  assert.equal(selectDiffScope([partial], "staged"), "staged");
  assert.equal(selectDiffScope([staged, unstaged], "staged"), "staged");
});

test("selected diff follows the file when staging or unstaging removes a scope", () => {
  assert.equal(selectDiffScope([staged], "unstaged"), "staged");
  assert.equal(selectDiffScope([unstaged], "staged"), "unstaged");
  assert.equal(hasDiffScope([staged], "unstaged"), false);
  assert.equal(hasDiffScope([unstaged], "staged"), false);
});

test("filtered batch staging preserves unrelated files and stages remaining partial changes", async () => {
  let files = [{ ...partial, path: "nested/partial.txt" }, { ...unstaged, path: "nested/new.txt" }, { ...unstaged, path: "other.txt" }];
  const calls = [];
  const update = async (paths, staged) => {
    calls.push({ paths, staged });
    files = files.map(file => paths.includes(file.path) ? { ...file, staged, partially_staged: false } : file);
    return { files };
  };
  const updated = await stageSelectedFiles(files.filter(file => file.path.startsWith("nested/")), true, update);
  assert.equal(updated[2].staged, false);
  assert.deepEqual(stagingSelection(updated.slice(0, 2)), { checked: true, indeterminate: false });
  assert.equal(selectDiffScope([updated[0]], "unstaged"), "staged");
  assert.equal(await stageSelectedFiles(updated.slice(0, 2), true, update), undefined);
  assert.equal(calls.length, 1);
  const unstagedFiles = await stageSelectedFiles(updated.slice(0, 2), false, update);
  assert.equal(selectDiffScope([unstagedFiles[0]], "staged"), "unstaged");
  assert.deepEqual(calls[1], { paths: ["nested/partial.txt", "nested/new.txt"], staged: false });
});
