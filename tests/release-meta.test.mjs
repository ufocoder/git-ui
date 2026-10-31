import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../.github/scripts/release-meta.mjs", import.meta.url));
function fixture(t, version = "0.1.0") {
  const cwd = mkdtempSync(join(tmpdir(), "git-ui-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "src-tauri"));
  const json = (path, value) => writeFileSync(join(cwd, path), JSON.stringify(value));
  json("package.json", { version });
  json("package-lock.json", { packages: { "": { version } } });
  json("src-tauri/tauri.conf.json", { version });
  writeFileSync(join(cwd, "src-tauri/Cargo.toml"), `[package]\nname = "git-ui"\nversion = "${version}"\n`);
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init");
  const commit = () => git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Test");
  commit();
  const run = (tag = "") => spawnSync(process.execPath, [script], {
    cwd, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "", RELEASE_EVENT_TAG: tag },
  });
  return { cwd, git, commit, run, json };
}

test("manual release derives version and SHA from selected commit", t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^tag=v0\.1\.0\nsha=[a-f0-9]{40}\nprerelease=false\n$/);
});
test("prerelease tag is recognized", t => {
  const f = fixture(t, "0.2.0-beta.1");
  const result = f.run("v0.2.0-beta.1");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /prerelease=true/);
});
test("mismatched app versions and tags are rejected", t => {
  const f = fixture(t);
  assert.notEqual(f.run("v9.0.0").status, 0);
  f.json("src-tauri/tauri.conf.json", { version: "0.2.0" });
  assert.notEqual(f.run().status, 0);
});
test("an existing tag cannot release another commit", t => {
  const f = fixture(t);
  f.git("tag", "v0.1.0");
  assert.equal(f.run().status, 0);
  f.commit();
  assert.notEqual(f.run().status, 0);
});
