import assert from 'node:assert/strict';import test from 'node:test';
import {createTaskQueue,TASK_CANCELLED} from '../src/lib/task-queue.ts';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('queue bounds simultaneous loads and frees slots after failures',async()=>{
 const queue=createTaskQueue(2),ends=[];let active=0,max=0;
 const jobs=Array.from({length:5},(_,index)=>queue.run(()=>new Promise((resolve,reject)=>{
  active++;max=Math.max(max,active);ends.push(()=>{active--;if(index===1)reject(Error('failed'));else resolve(index)});
 })));
 const observed=Promise.allSettled(jobs);await turn();assert.equal(ends.length,2);
 while(ends.length){ends.shift()();await turn();}
 const results=await observed;assert.equal(max,2);assert.equal(results[1].status,'rejected');assert.equal(results[4].value,4);
});
test('queued stale work is discarded without running its task',async()=>{
 const queue=createTaskQueue(1);let finish,valid=true,called=false;
 const first=queue.run(()=>new Promise(resolve=>{finish=resolve}));await turn();
 const second=queue.run(async()=>{called=true},()=>valid);const result=assert.rejects(second,new RegExp(TASK_CANCELLED));
 valid=false;finish();await first;await result;assert.equal(called,false);
});
