import assert from 'node:assert/strict';import test from 'node:test';
import {visibleLineBlocks} from '../src/lib/conflict-lines.ts';
test('100,000-line result mounts only intersecting highlight blocks',()=>{
 const blocks=Array.from({length:25000},(_,index)=>({start:index*4,end:index*4+1}));
 for(const start of [0,500,50000,99980]){
  const visible=visibleLineBlocks(blocks,start,start+40);
  assert.ok(visible.length<=11);assert.ok(visible.every(block=>block.start>=start&&block.end<start+40));
 }
 assert.deepEqual(visibleLineBlocks(blocks,100001,100100),[]);
});
test('huge blocks are clipped, edge intersections and empty windows are correct',()=>{
 assert.deepEqual(visibleLineBlocks([{start:0,end:99999}],50000,50040),[{start:50000,end:50039}]);
 assert.deepEqual(visibleLineBlocks([{start:2,end:4},{start:6,end:9}],4,7),[{start:4,end:4},{start:6,end:6}]);
 assert.deepEqual(visibleLineBlocks([],0,20),[]);assert.deepEqual(visibleLineBlocks([{start:0,end:2}],2,2),[]);
});
