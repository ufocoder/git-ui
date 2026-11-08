import assert from "node:assert/strict";
import test from "node:test";
import { createCommitFlow } from "../src/features/changes/commit-flow.ts";

const committed = { path: "/repo", current_branch: "main", tip: "new-commit", sync: { upstream: "origin/main" } };

test("retry sends the committed revision without creating another commit", async () => {
  const states = [];
  const targets = [];
  let commits = 0;
  const flow = createCommitFlow({
    commit: async () => { commits++; return committed; },
    push: async target => {
      targets.push(target);
      if (targets.length === 1) throw new Error("offline");
      return committed;
    },
    readHistory: async () => committed,
  }, state => states.push(state.kind));

  assert.equal(await flow.submit({ message: "Update", options: {}, push: { remote: "origin" } }), committed);
  assert.deepEqual(states, ["committing", "pushing", "pushFailed"]);
  assert.equal(await flow.retry(), committed);
  assert.equal(commits, 1);
  assert.deepEqual(targets[0], targets[1]);
  assert.equal(states.at(-1), "done");
});

test("retry refuses to push after the repository target changes", async () => {
  const changed = { ...committed, tip: "another-commit" };
  let pushes = 0;
  const flow = createCommitFlow({
    commit: async () => committed,
    push: async () => { pushes++; throw new Error("offline"); },
    readHistory: async () => changed,
  }, () => {});

  await flow.submit({ message: "Update", options: {}, push: { remote: "origin" } });
  assert.equal(await flow.retry(), changed);
  assert.equal(pushes, 1);
});
