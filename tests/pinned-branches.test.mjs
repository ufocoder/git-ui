import assert from "node:assert/strict";
import test from "node:test";
import { readPinnedBranches, savePinnedBranches, readPinnedTags, savePinnedTags, orderReferences, highlightedRanges } from "../src/lib/pinned-branches.ts";

test("pinned branches are isolated by project and local/remote reference", () => {
  const original = globalThis.localStorage;
  const values = new Map();
  try {
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const pinned = new Set(["refs/heads/main", "refs/remotes/origin/main"]);
    savePinnedBranches("/first", pinned);
    assert.deepEqual(readPinnedBranches("/first"), pinned);
    assert.deepEqual(readPinnedBranches("/second"), new Set());
    pinned.delete("refs/heads/main");
    savePinnedBranches("/first", pinned);
    assert.deepEqual(readPinnedBranches("/first"), new Set(["refs/remotes/origin/main"]));
    values.set("git-ui.pinned-branches.v1:/first", '["main","main",null,12,""]');
    assert.deepEqual(readPinnedBranches("/first"), new Set(["main"]));
    values.set("git-ui.pinned-branches.v1:/first", "broken");
    assert.deepEqual(readPinnedBranches("/first"), new Set());
    globalThis.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
    assert.deepEqual(readPinnedBranches("/first"), new Set());
    assert.doesNotThrow(() => savePinnedBranches("/first", pinned));
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});

test("pins remain first and preserve sorting while search prioritizes matches within each group", () => {
  const items = ["a", "b", "c", "d", "e"];
  const pinned = new Set(["b", "e"]);
  assert.deepEqual(orderReferences(items, name => pinned.has(name), new Set()), ["b", "e", "a", "c", "d"]);
  assert.deepEqual(orderReferences([...items].reverse(), name => pinned.has(name), new Set()), ["e", "b", "d", "c", "a"]);
  const matches = new Set(["a", "e"]);
  const ordered = orderReferences(items, name => pinned.has(name), matches);
  assert.deepEqual(ordered, ["e", "b", "a", "c", "d"]);
  assert.deepEqual(highlightedRanges(ordered, matches), [{ start: 0, length: 1 }, { start: 2, length: 1 }]);
  assert.deepEqual(items, ["a", "b", "c", "d", "e"]);
});

test("search highlighting remains one area for consecutive matches when no branches are pinned", () => {
  const matches = new Set(["a", "c"]);
  const items = orderReferences(["a", "b", "c"], () => false, matches);
  assert.deepEqual(items, ["a", "c", "b"]);
  assert.deepEqual(highlightedRanges(items, matches), [{ start: 0, length: 2 }]);
  assert.deepEqual(highlightedRanges(items, new Set()), []);
});


test("tag pins stay independent from branch pins and other projects", () => {
  const original = globalThis.localStorage;
  const values = new Map();
  try {
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    savePinnedBranches("/project", new Set(["refs/heads/release"]));
    savePinnedTags("/project", new Set(["v1.2.0", "v1.0.0"]));
    assert.deepEqual(readPinnedTags("/other"), new Set());
    assert.deepEqual(readPinnedBranches("/project"), new Set(["refs/heads/release"]));
    const pins = readPinnedTags("/project");
    const items = ["v1.3.0", "v1.2.0", "v1.1.0", "v1.0.0"];
    assert.deepEqual(orderReferences(items, name => pins.has(name), new Set()), ["v1.2.0", "v1.0.0", "v1.3.0", "v1.1.0"]);
    pins.delete("v1.2.0");
    savePinnedTags("/project", pins);
    assert.deepEqual(readPinnedTags("/project"), new Set(["v1.0.0"]));
    assert.deepEqual(readPinnedBranches("/project"), new Set(["refs/heads/release"]));
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
