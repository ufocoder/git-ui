import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readReleaseNotes, releaseBody, withReleaseNotes } from "../.github/scripts/release-notes.mjs";
function fixture(run) {
 const root=mkdtempSync(path.join(tmpdir(),"git-ui-notes-"));
 const dir=path.join(root,"releases","0.4.2");mkdirSync(dir,{recursive:true});
 try {run(root,dir)} finally {rmSync(root,{recursive:true,force:true})}
}
test("release notes require English and allow missing translations",()=>fixture((root,dir)=>{
 assert.throws(()=>readReleaseNotes(root,"v0.4.2"));
 writeFileSync(path.join(dir,"en.md"),"  - Faster diffs\n");
 assert.deepEqual(readReleaseNotes(root,"v0.4.2"),{en:"- Faster diffs"});
 writeFileSync(path.join(dir,"ru.md"),"  ");assert.throws(()=>readReleaseNotes(root,"v0.4.2"),/empty/);
 assert.throws(()=>readReleaseNotes(root,"../invalid"),/Invalid/);
}));
test("localized notes populate the release body and preserve signed platform metadata",()=>fixture((root,dir)=>{
 for(const lang of ["en","ru","zh"])writeFileSync(path.join(dir,`${lang}.md`),`- ${lang} improvements`);
 const notes=readReleaseNotes(root,"0.4.2"),body=releaseBody(notes);
 assert.ok(body.startsWith(notes.en));assert.ok(body.includes(notes.ru));assert.ok(body.includes(notes.zh));
 const manifest={version:"v0.4.2",pub_date:"2026-11-23",platforms:{target:{signature:"keep",url:"https://example.com/update"}}};
 const updated=withReleaseNotes(manifest,"v0.4.2",notes);
 assert.deepEqual(updated.platforms,manifest.platforms);assert.equal(updated.pub_date,manifest.pub_date);
 assert.equal(updated.notes,notes.en);assert.deepEqual(updated.notesLocalized,notes);
 assert.throws(()=>withReleaseNotes(manifest,"v0.4.3",notes),/version/);
 assert.equal(manifest.notes,undefined);
}));
