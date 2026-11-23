import assert from 'node:assert/strict';
import test from 'node:test';
import { indexFileSelection } from '../src/lib/file-selection-index.ts';
import { stagingSelection, stageSelectedFiles } from '../src/features/changes/staging-selection.ts';
const file=(path,staged=false,partial=false)=>({path,staged,partially_staged:partial,status:'M',old_path:null});
test('directory states aggregate bottom up including partially staged files',()=>{
 const files=[file('a/b/staged',true),file('a/b/partial',true,true),file('a/c/new'),file('root',true)];
 const index=indexFileSelection(files);
 assert.equal(index.root.count,4);assert.equal(index.root.stagedCount,3);assert.equal(index.root.fullyStagedCount,2);
 for(const [path,directory] of index.directories){
  const expected=files.filter(f=>f.path.startsWith(path+'/'));
  assert.deepEqual({checked:directory.checked,indeterminate:directory.indeterminate},stagingSelection(expected));
  assert.deepEqual(new Set(directory.files()),new Set(expected));
 }
 assert.equal(index.byPath.get('a/b/partial'),files[1]);
 assert.deepEqual(index.filesIn('missing'),[]);
});
test('filtered groups stage only matches and update parent states from the new snapshot',async()=>{
 const files=[file('a/first'),file('a/second'),file('unrelated')];
 const filtered=indexFileSelection(files.slice(0,1));let paths;
 const updated=await stageSelectedFiles(filtered.directories.get('a').files(),true,async selected=>{
  paths=selected;return {files:files.map(f=>selected.includes(f.path)?{...f,staged:true}:f)};
 });
 assert.deepEqual(paths,['a/first']);
 const next=indexFileSelection(updated);
 assert.equal(next.directories.get('a').checked,false);assert.equal(next.directories.get('a').indeterminate,true);
 assert.equal(updated[2].staged,false);
 const all=indexFileSelection(updated.map(f=>({...f,staged:true})));
 assert.equal(all.root.checked,true);assert.equal(all.directories.get('a').checked,true);
});
test('indexes literal path boundaries and all original parents of compact chains',()=>{
 const files=[file('src/a/b/c/file',true),file('src-extra/not-child'),file('src')];
 const index=indexFileSelection(files);
 for(const path of ['src','src/a','src/a/b','src/a/b/c'])assert.deepEqual(index.filesIn(path),[files[0]]);
 assert.deepEqual(indexFileSelection([]).root.files(),[]);
 assert.equal(indexFileSelection([]).root.checked,false);
});
