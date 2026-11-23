import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiffCache } from '../src/lib/diff-cache.ts';
const spec = {project:'one',commit:'abc123',path:'a.ts'};
test('immutable diff is reused, with project, scope and stash isolation', async () => {
 let calls=0;const cache=createDiffCache(async()=>++calls,()=>1);
 assert.equal(await cache.load(spec),1);assert.equal(cache.peek(spec),1);
 assert.equal(await cache.load({...spec}),1);
 for(const change of [{project:'two'},{scope:'staged'},{stash:true},{path:'b.ts'}]) await cache.load({...spec,...change});
 assert.equal(calls,5);
});
test('worktree snapshot invalidates cached content and absent snapshots are never cached', async()=>{
 let calls=0;const cache=createDiffCache(async()=>++calls,()=>1);
 const first={...spec,commit:'WORKTREE',revision:{}};
 assert.equal(await cache.load(first),1);assert.equal(await cache.load(first),1);
 assert.equal(await cache.load({...first,revision:{}}),2);
 const noRevision={...first,revision:undefined};
 await cache.load(noRevision);await cache.load(noRevision);assert.equal(calls,4);
});
test('inflight requests are shared and old responses cannot poison newer snapshots',async()=>{
 const finish=[];const cache=createDiffCache(()=>new Promise(resolve=>finish.push(resolve)),()=>1);
 const first={...spec,commit:'WORKTREE',revision:{}},second={...first,revision:{}};
 const a=cache.load(first),duplicate=cache.load(first),b=cache.load(second);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(finish.length,2);
 finish[1]('new');assert.equal(await b,'new');finish[0]('old');await a;await duplicate;
 assert.equal(cache.peek(second),'new');
});
test('LRU entries obey both byte and count budgets, failures can be retried',async()=>{
 let calls=0;const cache=createDiffCache(async()=>{calls++;if(calls===1)throw Error('failed');return calls},()=>4,8,2);
 await assert.rejects(cache.load(spec));await cache.load(spec);
 await cache.load({...spec,path:'b'});cache.peek(spec);await cache.load({...spec,path:'c'});
 assert.equal(cache.peek({...spec,path:'b'}),undefined);assert.equal(cache.peek(spec),2);
});
test('queued obsolete requests do not fetch, but a live deduplicated subscriber keeps its job',async()=>{
 let valid=true;const finish=[];let calls=0;
 const cache=createDiffCache(()=>{calls++;return new Promise(resolve=>finish.push(resolve))},()=>1);
 const a=cache.load(spec),b=cache.load({...spec,path:'b'});
 const c=cache.load({...spec,path:'c'},()=>valid);const observed=assert.rejects(c,/background_task_cancelled/);
 const d=cache.load({...spec,path:'d'},()=>valid);const live=cache.load({...spec,path:'d'});
 await new Promise(resolve=>setImmediate(resolve));valid=false;finish.shift()(1);finish.shift()(2);await a;await b;
 await new Promise(resolve=>setImmediate(resolve));await observed;assert.equal(calls,3);finish.shift()(4);assert.equal(await d,4);assert.equal(await live,4);
});
