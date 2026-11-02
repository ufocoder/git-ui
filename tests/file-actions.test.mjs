import assert from "node:assert/strict";
import test from "node:test";
import { absoluteProjectPath } from "../src/lib/file-actions-context.ts";

test("copied paths use the repository platform separators and preserve literal names", () => {
  assert.equal(absoluteProjectPath("/Projects/repo/", "src/a[1].txt"), "/Projects/repo/src/a[1].txt");
  assert.equal(absoluteProjectPath("C:\\Projects\\repo\\", "src/a.txt"), "C:\\Projects\\repo\\src\\a.txt");
  assert.equal(absoluteProjectPath("/", "a.txt"), "/a.txt");
  assert.equal(absoluteProjectPath("/Projects/repo\\name", "src/a.txt"), "/Projects/repo\\name/src/a.txt");
});
