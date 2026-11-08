import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../.github/scripts/check-updater-manifest.mjs", import.meta.url);
function validate(modify = () => {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "git-ui-updater-"));
  const manifest = { version: "0.2.0", platforms: Object.fromEntries(
    ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"].map(target =>
      [target, { signature: "signature", url: `https://github.com/example/app/releases/download/v0.2.0/${target}` }])) };
  modify(manifest);
  const file = path.join(directory, "latest.json");
  try {
    writeFileSync(file, JSON.stringify(manifest));
    return spawnSync(process.execPath, [script.pathname, file, "v0.2.0"], { encoding: "utf8" });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("complete signed updater metadata is publishable", () => {
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
});

test("publishing rejects mismatched versions and missing update targets", () => {
  assert.notEqual(validate(manifest => { manifest.version = "0.1.0"; }).status, 0);
  for (const target of ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]) {
    assert.notEqual(validate(manifest => { delete manifest.platforms[target]; }).status, 0);
  }
});

test("publishing rejects unsigned assets and insecure download URLs", () => {
  assert.notEqual(validate(manifest => { manifest.platforms["darwin-aarch64"].signature = ""; }).status, 0);
  assert.notEqual(validate(manifest => { manifest.platforms["darwin-x86_64"].url = "http://example.com/update"; }).status, 0);
});
