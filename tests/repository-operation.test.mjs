import assert from "node:assert/strict";
import test from "node:test";
import { createRepositoryOperation } from "../src/features/repository/repository-operation.ts";

function fixture(readHistory = async () => "refreshed") {
  let busy = false;
  const events = [];
  const run = createRepositoryOperation({
    busy: () => busy,
    setBusy: value => { busy = value; events.push(value); },
    setHistory: history => events.push(history),
    readHistory,
    openTerminal: () => events.push("terminal"),
    busyError: () => new Error("busy"),
  });
  return { run, events };
}

test("repository operations serialize mutations and publish the result", async () => {
  const { run, events } = fixture();
  let complete;
  const first = run(() => new Promise(resolve => { complete = resolve; }));
  await assert.rejects(run(async () => assert.fail("second operation ran")), /busy/);
  complete("updated");
  await first;
  assert.deepEqual(events, [true, "updated", false]);
});

test("a rebase can recover into conflict resolution and release the lock", async () => {
  const { run, events } = fixture();
  await run(async () => { throw new Error("conflict"); }, {
    openTerminalOnError: true,
    refreshOnError: true,
    acceptRecovered: history => history === "refreshed",
  });
  assert.deepEqual(events, [true, "terminal", "refreshed", false]);
});

test("failed recovery preserves the original error and releases the lock", async () => {
  const { run, events } = fixture(async () => { throw new Error("refresh"); });
  const failure = new Error("original");
  await assert.rejects(run(async () => { throw failure; }, { refreshOnError: true }), error => error === failure);
  assert.deepEqual(events, [true, false]);
});
