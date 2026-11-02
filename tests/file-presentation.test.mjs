import assert from "node:assert/strict";
import test from "node:test";
import { compareChangedFiles, readFilePresentation, saveFilePresentation } from "../src/lib/file-presentation.ts";
import { buildFileTree } from "../src/lib/file-tree.ts";

test("sorts flat paths, basenames and statuses with stable path tie-breaks", () => {
  const files = [{ path: "a/z10.txt", status: "M" }, { path: "b/a.txt", status: "A" }, { path: "a/z2.txt", status: "U" }];
  const paths = sort => [...files].sort((a, b) => compareChangedFiles(a, b, sort)).map(file => file.path);
  assert.deepEqual(paths("path"), ["a/z2.txt", "a/z10.txt", "b/a.txt"]);
  assert.deepEqual(paths("name"), ["b/a.txt", "a/z2.txt", "a/z10.txt"]);
  assert.deepEqual(paths("status"), ["a/z2.txt", "b/a.txt", "a/z10.txt"]);
  assert.ok(compareChangedFiles({ path: "a/same", status: "M" }, { path: "b/same", status: "M" }, "name") < 0);
  assert.equal(files[0].path, "a/z10.txt");
});

test("tree sorting keeps directories first and preserves file identities", () => {
  const files = [{ path: "src/a.txt", status: "A" }, { path: "src/z.txt", status: "M" }, { path: "root.txt", status: "U" }];
  const nodes = buildFileTree(files, { compareFiles: (a, b) => compareChangedFiles(a, b, "status"), descending: true });
  assert.equal(nodes[0].kind, "directory");
  assert.deepEqual(nodes[0].children.map(node => node.name), ["z.txt", "a.txt"]);
  assert.equal(nodes[0].children[0].value, files[1]);
});

test("persists display preferences and recovers from missing or corrupt storage", () => {
  const original = globalThis.localStorage;
  let stored = null;
  try {
    globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
    assert.deepEqual(readFilePresentation(), { view: "tree", sort: "path", descending: false });
    saveFilePresentation({ view: "list", sort: "status", descending: true });
    assert.deepEqual(readFilePresentation(), { view: "list", sort: "status", descending: true });
    stored = '{"view":"invalid","sort":"unknown","descending":"yes"}';
    assert.deepEqual(readFilePresentation(), { view: "tree", sort: "path", descending: false });
    stored = "corrupt";
    assert.equal(readFilePresentation().view, "tree");
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
