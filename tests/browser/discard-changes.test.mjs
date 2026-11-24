import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createSignal } from 'solid-js';
import { setTimeout as delay } from 'node:timers/promises';
import { createDiscardChanges } from '../../src/features/changes/discard-changes.ts';

const file = path => ({path,status:'M',staged:false,partially_staged:false,old_path:null});
const target = paths => ({head:'head',branch:'main',paths,token:'snapshot'});
const deferred = () => {let resolve, reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(t, overrides={}) {
 let model, close, dispose;
 const history={tip:'head',current_branch:'main',conflicts:[],worktree_files:[file('one'),file('two')]};
 const updates=[], busy=[];
 createRoot(end=>{
  dispose=end;
  const [path,setPath]=createSignal('');close=()=>setPath(undefined);
  model=createDiscardChanges({get path(){return path();},history,busy:false,onHistoryChange:value=>updates.push(value),onBusyChange:value=>busy.push(value)}, {
   getCommitDetails:async()=>({files:history.worktree_files}),
   previewDiscardChanges:async paths=>({target:target(paths),files:[]}),
   discardWorktreeChanges:async()=>({history,backup:'backup',count:2}),...overrides,
  });
 });
 t.after(dispose);
 return {model,history,updates,busy,close,dispose};
}
test('selection invalidates confirmation and an obsolete preview cannot win',async t=>{
 const first=deferred();let calls=0;
 const {model}=fixture(t,{previewDiscardChanges:async paths=>++calls===1?first.promise:{target:target(paths),files:[]}});
 await delay(175);model.toggle('two',false);await delay(175);
 first.resolve({target:target(['one','two']),files:[]});await delay(0);
 assert.deepEqual(model.preview().target.paths,['one']);
 model.setConfirmed(true);model.toggle('two',true);
 assert.equal(model.confirmed(),false);assert.equal(model.preview(),undefined);
});
test('requires confirmation, prevents duplicate submissions and retains completion',async t=>{
 const pending=deferred();let calls=0;
 const {model,busy,updates,history}=fixture(t,{discardWorktreeChanges:()=>{calls++;return pending.promise;}});
 await delay(175);await model.submit();assert.equal(calls,0);
 model.setConfirmed(true);const submission=model.submit();await model.submit();
 assert.equal(calls,1);assert.equal(model.pending(),true);
 pending.resolve({history,backup:'backup',count:2});await submission;await delay(0);
 assert.equal(model.result().backup,'backup');assert.equal(model.pending(),false);
 assert.equal(updates.length,1);assert.deepEqual(busy,[true,false]);
});
test('failed discard releases busy state and requires a fresh preview',async t=>{
 const {model,busy}=fixture(t,{discardWorktreeChanges:async()=>{throw new Error('changed');}});
 await delay(175);model.setConfirmed(true);await model.submit();
 assert.match(model.error(),/changed/);assert.equal(model.preview(),undefined);
 assert.equal(model.confirmed(),false);assert.equal(model.pending(),false);
 assert.deepEqual(busy,[true,false]);
 model.toggle('two',false);await delay(175);assert.ok(model.preview());assert.equal(model.error(),'');
});
test('closing or disposing ignores an outstanding response',async t=>{
 const response=deferred();const {model,close,dispose}=fixture(t,{previewDiscardChanges:()=>response.promise});
 await delay(175);close();dispose();response.resolve({target:target(['one']),files:[]});await delay(0);
 assert.equal(model.preview(),undefined);
});
