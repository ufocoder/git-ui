import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const pkg = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Unsupported release version: ${version}`);
}
const versions = [tauri.version, cargoVersion, readJson("package-lock.json").packages[""].version];
if (versions.some(value => value !== version)) {
  throw new Error("Versions must match in package.json, package-lock.json, Cargo.toml and tauri.conf.json");
}
const tag = `v${version}`;
if (process.env.RELEASE_EVENT_TAG && process.env.RELEASE_EVENT_TAG !== tag) {
  throw new Error(`Tag ${process.env.RELEASE_EVENT_TAG} does not match app version ${tag}`);
}
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const existing = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], { encoding: "utf8" });
if (existing.status === 0 && existing.stdout.trim() !== sha) {
  throw new Error(`Tag ${tag} already points to another commit`);
}
const output = `tag=${tag}\nsha=${sha}\nprerelease=${version.includes("-")}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
