import assert from 'node:assert/strict';import test from 'node:test';
import {createDirectoryScrollAnchor} from '../src/lib/directory-scroll-anchor.ts';
test('simultaneous diff expansions preserve the visible file and user input cancels compensation',()=>{
 const originals={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 let frame,offset=-40;const handlers=new Map();
 const element={isConnected:true,getBoundingClientRect:()=>({top:offset}),closest:()=>element};
 const viewport={scrollTop:300,contains:()=>true,getBoundingClientRect:()=>({top:0,left:0,width:500,bottom:400}),addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener:name=>handlers.delete(name)};
 globalThis.document={elementFromPoint:()=>element};globalThis.requestAnimationFrame=callback=>{frame=callback;return 1};globalThis.cancelAnimationFrame=()=>{frame=undefined};
 try {
  const anchor=createDirectoryScrollAnchor(viewport);
  anchor.preserve(()=>{offset+=200});anchor.preserve(()=>{offset+=150});frame();assert.equal(viewport.scrollTop,650);
  anchor.preserve(()=>{offset+=100});handlers.get('wheel')();assert.equal(frame,undefined);assert.equal(viewport.scrollTop,650);
  anchor.dispose();assert.equal(handlers.size,0);
 } finally {Object.assign(globalThis,originals)}
});
