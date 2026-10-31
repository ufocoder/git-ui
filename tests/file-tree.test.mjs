import assert from "node:assert/strict";
import test from "node:test";
import { buildFileTree } from "../src/lib/file-tree.ts";

test("keeps every directory even when there is just one changed file", () => {
  const file = { path: "folder1/folder3/folder3/file.md", status: "M" };
  let nodes = buildFileTree([file]);
  for (const name of ["folder1", "folder3", "folder3"]) {
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, "directory");
    assert.equal(nodes[0].name, name);
    nodes = nodes[0].children;
  }
  assert.equal(nodes[0].name, "file.md");
  assert.equal(nodes[0].path, file.path);
  assert.equal(nodes[0].value, file);
});

test("shares directories and sorts folders before files", () => {
  const nodes = buildFileTree([{ path: "src/z.ts" }, { path: "readme.md" }, { path: "src/lib/a.ts" }, { path: "src/a.ts" }]);
  assert.deepEqual(nodes.map(node => node.name), ["src", "readme.md"]);
  assert.deepEqual(nodes[0].children.map(node => node.name), ["lib", "a.ts", "z.ts"]);
});

test("keeps renamed/deleted status and handles file-to-directory changes", () => {
  const deleted = { path: "item", status: "D" };
  const renamed = { path: "item/new.md", old_path: "old.md", status: "R" };
  const nodes = buildFileTree([deleted, renamed]);
  assert.equal(nodes[0].kind, "directory");
  assert.equal(nodes[0].children[0].value, renamed);
  assert.equal(nodes[1].value, deleted);
});

test("does not interpret backslashes in Git filenames as directories", () => {
  const nodes = buildFileTree([{ path: "file\\name.md" }]);
  assert.equal(nodes[0].kind, "file");
  assert.equal(nodes[0].name, "file\\name.md");
  assert.deepEqual(buildFileTree([]), []);
});
