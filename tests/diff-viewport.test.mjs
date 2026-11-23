import assert from 'node:assert/strict';
import test from 'node:test';
import { diffLayout, correspondingDiffRow } from '../src/lib/diff-viewport.ts';
import { virtualOffsetRange } from '../src/lib/virtual-range.ts';
import { parseDiff, diffRows } from '../src/lib/diff.ts';
const line = number => ({kind:'line',left:{kind:'context',text:`line ${number}`,oldLine:number,newLine:number},right:null});
test('mixed-height headers, context folds and lines have accurate navigation offsets', () => {
  const rows = [{kind:'header',hunk:0,text:'first'},line(1),{kind:'fold',id:'0:1',count:5000},line(5002),{kind:'header',hunk:1,text:'second'},line(6000)];
  const layout = diffLayout(rows,16,24);
  assert.deepEqual(layout.offsets,[0,24,40,64,80,104,120]);
  assert.deepEqual(layout.hunkRows,[0,4]);
  assert.equal(layout.offsets[layout.hunkRows[1]],80);
  assert.equal(diffLayout(rows,20,30).total,150);
});
test('scrolling a huge diff in either direction keeps a bounded, covering window', () => {
  const rows = Array.from({length:100000},(_,i)=> i%1000===0?{kind:'header',hunk:i/1000,text:'hunk'}:line(i));
  const layout = diffLayout(rows,16,24);
  for(const height of [200,600,1200]) for(const top of [0,500000,layout.total-height,200000,0]) {
    const range = virtualOffsetRange(layout.offsets,top,height,12);
    assert.ok(range.end-range.start <= Math.ceil(height/16)+26);
    assert.ok(layout.offsets[range.start] <= top);
    assert.ok(layout.offsets[range.end] >= top+height);
    assert.ok(range.start>=0 && range.end<=rows.length);
  }
  assert.deepEqual(virtualOffsetRange([0],0,600),{start:0,end:0});
  assert.deepEqual(virtualOffsetRange(layout.offsets,-1000,600),{start:0,end:0});
  assert.deepEqual(virtualOffsetRange(layout.offsets,layout.total+100,600),{start:rows.length,end:rows.length});
});
test('switching unified and split views preserves the visible source line', () => {
  const parsed = parseDiff('@@ -1,3 +1,3 @@\n same\n-old\n+new\n last\n');
  const unified = diffRows(parsed,false,false,new Set()), split = diffRows(parsed,true,false,new Set());
  const anchor = unified.find(row=>row.kind==='line'&&row.right?.kind==='add');
  const index = correspondingDiffRow(split,anchor,0);
  assert.equal(split[index].right.text,'new');
  assert.equal(unified[correspondingDiffRow(unified,split[index],0)].left?.oldLine,split[index].left.oldLine);
  assert.equal(correspondingDiffRow(split,{kind:'header',hunk:0,text:'changed'},0),0);
});
test('offscreen long lines keep their horizontal space reserved', () => {
  const rows=[line(1),{...line(2),right:{kind:'add',text:'x'.repeat(3000),newLine:2,oldLine:null}}];
  const layout=diffLayout(rows,16,24);
  assert.equal(layout.rightColumns,3000);
  assert.equal(layout.offsets.length,rows.length+1);
});
