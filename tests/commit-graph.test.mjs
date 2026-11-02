import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitGraph } from "../src/lib/commit-graph.ts";

test("ends the line at the last visible commit and extends it after loading its parent", () => {
  const head = { hash: "head", parents: ["middle"] };
  const middle = { hash: "middle", parents: ["root"] };
  const root = { hash: "root", parents: [] };
  const partial = buildCommitGraph([head, middle]);
  assert.deepEqual(partial.rows[1].edges, [{ from: 0, to: 0, top: true, bottom: false }]);
  const full = buildCommitGraph([head, middle, root]);
  assert.ok(full.rows[1].edges.some(edge => edge.bottom));
  assert.deepEqual(full.rows[2].edges, [{ from: 0, to: 0, top: true, bottom: false }]);
});

test("a newly appearing remote branch has no line above its first commit", () => {
  const graph = buildCommitGraph([
    { hash: "local", parents: ["base"] },
    { hash: "remote", parents: ["base"] },
    { hash: "base", parents: [] },
  ]);
  const remote = graph.rows[1];
  assert.ok(!remote.edges.some(edge => edge.from === remote.column && edge.top));
  assert.ok(remote.edges.some(edge => edge.from === remote.column && edge.bottom));
});
