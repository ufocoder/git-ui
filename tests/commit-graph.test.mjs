import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitGraph, graphEdgePath } from "../src/lib/commit-graph.ts";

test("continues to an unloaded parent and ends only at a root", () => {
  const head = { hash: "head", parents: ["middle"] };
  const middle = { hash: "middle", parents: ["root"] };
  const root = { hash: "root", parents: [] };
  const partial = buildCommitGraph([head, middle]);
  assert.ok(partial.rows[1].edges.some(edge => edge.bottom));
  const full = buildCommitGraph([head, middle, root]);
  assert.ok(full.rows[1].edges.some(edge => edge.bottom));
  assert.deepEqual(full.rows[2].edges, [{ from: 0, to: 0, top: true, bottom: false, color: 0 }]);
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

test("keeps an unloaded parent lane running through neighbouring branches", () => {
  const commits = [
    { hash: "side-tip", parents: ["side-parent"] },
    { hash: "main-tip", parents: ["main-parent"] },
    { hash: "main-parent", parents: ["root"] },
  ];
  const partial = buildCommitGraph(commits);
  assert.ok(partial.rows[0].edges.some(edge => edge.bottom));
  for (const row of partial.rows.slice(1)) {
    assert.ok(row.edges.some(edge => edge.from === 0 && edge.to === 0 && edge.top && edge.bottom));
  }
  const loaded = buildCommitGraph([...commits, { hash: "side-parent", parents: ["root"] }, { hash: "root", parents: [] }]);
  assert.deepEqual(partial.rows, loaded.rows.slice(0, commits.length));
});

test("a missing parent always has a downward edge, including filtered histories", () => {
  assert.deepEqual(buildCommitGraph([{ hash: "root", parents: [] }]).rows[0].edges, []);
  assert.deepEqual(buildCommitGraph([{ hash: "filtered", parents: ["excluded"] }]).rows[0].edges, [
    { from: 0, to: 0, top: false, bottom: true, color: 0 },
  ]);
});


test("lane colors follow ancestry when another lane closes", () => {
  const graph = buildCommitGraph([
    { hash: "a", parents: ["root-a"] },
    { hash: "b", parents: ["root-b"] },
    { hash: "root-a", parents: [] },
    { hash: "root-b", parents: [] },
  ]);
  assert.equal(graph.rows[1].color, graph.rows[3].color);
  assert.notEqual(graph.rows[0].color, graph.rows[1].color);
  assert.ok(graph.rows[2].edges.some(edge => edge.color === graph.rows[1].color && edge.from !== edge.to));
});

test("curves have vertical tangents and straight lanes retain their coordinates", () => {
  assert.equal(graphEdgePath({ from: 0, to: 0, top: true, bottom: true, color: 0 }, 34), "M 12 0 L 12 34");
  assert.equal(graphEdgePath({ from: 0, to: 1, top: false, bottom: true, color: 0 }, 34), "M 12 17 C 12 25.5, 28 25.5, 28 34");
});
