import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function readReleaseNotes(root, tag) {
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Invalid release version");
  const notes = {};
  for (const language of ["en", "ru", "zh"]) {
    const file = path.join(root, "releases", version, `${language}.md`);
    let text;
    try { text = readFileSync(file, "utf8").trim(); }
    catch (error) { if (language !== "en" && error.code === "ENOENT") continue; throw error; }
    if (!text) throw new Error(`Release notes are empty: ${file}`);
    notes[language] = text;
  }
  return notes;
}
export function releaseBody(notes) {
  return notes.en + [ ["ru", "Русский"], ["zh", "简体中文"] ].filter(([language]) => notes[language])
    .map(([language, title]) => `\n\n<details>\n<summary>${title}</summary>\n\n${notes[language]}\n\n</details>`).join("") + "\n";
}
export function withReleaseNotes(manifest, tag, notes) {
  if (manifest.version?.replace(/^v/, "") !== tag.replace(/^v/, "")) throw new Error("Updater version does not match release notes");
  return { ...manifest, notes: notes.en, notesLocalized: notes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [tag, bodyFile, manifestFile] = process.argv.slice(2);
  const notes = readReleaseNotes(process.cwd(), tag);
  writeFileSync(bodyFile, releaseBody(notes));
  if (manifestFile) {
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    writeFileSync(manifestFile, JSON.stringify(withReleaseNotes(manifest, tag, notes), null, 2) + "\n");
  }
}
