import assert from "node:assert/strict";
import test from "node:test";
import { stagingSelection, hasDiffScope, selectDiffScope } from "../src/features/changes/staging-selection.ts";
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
