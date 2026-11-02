import assert from "node:assert/strict";
import test from "node:test";
import { operationNotice, startOperation, finishOperation, dismissOperation, explainOperationError } from "../src/lib/operation-feedback.ts";

test("an older operation cannot replace or dismiss a newer result", () => {
  const first = startOperation("Fetch");
  const second = startOperation("Push");
  finishOperation(first, "Fetch");
  assert.equal(operationNotice().id, second);
  assert.equal(operationNotice().state, "running");
  dismissOperation(first);
  assert.equal(operationNotice().id, second);
  finishOperation(second, "Push");
  assert.equal(operationNotice().state, "success");
  dismissOperation(second);
  assert.equal(operationNotice(), undefined);
});

test("common Git errors have actionable summaries and unknown errors keep useful detail", () => {
  assert.match(explainOperationError("fatal: unable to auto-detect email address"), /email/);
  assert.match(explainOperationError("! [rejected] main -> main (non-fast-forward)"), /разошлись/);
  assert.match(explainOperationError("error: gpg failed to sign the data"), /подписать/);
  assert.match(explainOperationError("Permission denied (publickey)"), /SSH/);
  assert.equal(explainOperationError("Repository is locked\nDetails"), "Repository is locked");
});
