import assert from "node:assert/strict";
import test from "node:test";
import { preservedSelection, anchoredScroll } from "../src/lib/history-view.ts";

test("refresh keeps the selected commit object so its open diff is not remounted", () => {
  const selected = { hash: "old", subject: "selected" };
  const refreshed = [{ hash: "new" }, { hash: "old" }];
  assert.equal(preservedSelection(selected, refreshed), selected);
  assert.equal(preservedSelection({ hash: "removed" }, refreshed), refreshed[0]);
  assert.equal(preservedSelection(selected, []), undefined);
});

test("new commits preserve the visible row and its position within the viewport", () => {
  const refreshed = [{ hash: "new" }, { hash: "head" }, { hash: "anchor" }];
  assert.equal(anchoredScroll(refreshed, "anchor", 12, 46, 34), 80);
  assert.equal(anchoredScroll(refreshed, "removed", 12, 46, 34), 46);
});
