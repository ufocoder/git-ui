import assert from "node:assert/strict";
import test from "node:test";
import { validPanelSizes, readPanelSizes, savePanelSizes, panelStorageKey } from "../src/lib/layout-preferences.ts";

test("layout preferences reject corrupt sizes and isolate repositories and modes", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    savePanelSizes("/first", "changes", [0.3, 0.7], 2);
    assert.deepEqual(readPanelSizes("/first", "changes", [0.5, 0.5]), [0.3, 0.7]);
    assert.deepEqual(readPanelSizes("/second", "changes", [0.5, 0.5]), [0.5, 0.5]);
    assert.deepEqual(readPanelSizes("/first", "stash", [1 / 3, 2 / 3]), [1 / 3, 2 / 3]);
    savePanelSizes("/first", "changes", [1, 0], 2);
    assert.deepEqual(readPanelSizes("/first", "changes", [0.5, 0.5]), [0.3, 0.7]);
    values.set(panelStorageKey("/first", "changes"), "broken JSON");
    assert.deepEqual(readPanelSizes("/first", "changes", [0.5, 0.5]), [0.5, 0.5]);
    for (const invalid of [[0.2], [NaN, 1], [0.8, 0.8], [-0.2, 1.2], "0.5,0.5"]) assert.equal(validPanelSizes(invalid, 2), false);
  } finally { delete globalThis.localStorage; }
});
