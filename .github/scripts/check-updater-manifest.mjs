import { readFileSync } from "node:fs";

const [file, tag] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(file, "utf8"));
if (manifest.version.replace(/^v/, "") !== tag.replace(/^v/, "")) {
  throw new Error("Updater version does not match the release tag");
}
for (const target of ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]) {
  const platform = manifest.platforms?.[target];
  if (!platform?.signature?.trim() || !platform?.url || new URL(platform.url).protocol !== "https:") {
    throw new Error(`Missing signed update for ${target}`);
  }
}
console.log("Updater manifest includes all supported platforms");
