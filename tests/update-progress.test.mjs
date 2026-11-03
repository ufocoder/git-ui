import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadPercent, setNativeProgressValue } from '../src/lib/update-progress.ts';

function webkitProgress() {
  const attributes = new Map();
  return {
    attributes,
    element: {
      set value(value) { if (!Number.isFinite(value)) throw new TypeError('The provided value is non-finite'); attributes.set('value', value); },
      removeAttribute(name) { attributes.delete(name); },
    },
  };
}

test('unknown download size never writes undefined to the native progress property', () => {
  const {element, attributes} = webkitProgress();
  for (const status of [undefined, {downloaded:0,total:null}, {downloaded:1024,total:null}, {downloaded:0,total:0}]) {
    setNativeProgressValue(element, downloadPercent(status));
    assert.equal(attributes.has('value'), false);
  }
});

test('download transitions from indeterminate to measured progress and back for installation', () => {
  const {element, attributes} = webkitProgress();
  const phases = [{downloaded:0,total:null}, {downloaded:25,total:100}, {downloaded:150,total:100}, {downloaded:0,total:null}];
  const expected = [undefined,25,100,undefined];
  phases.forEach((status,index)=>{setNativeProgressValue(element,downloadPercent(status));assert.equal(attributes.get('value'),expected[index]);});
});

test('invalid progress data cannot produce NaN or infinity in the DOM', () => {
  const {element, attributes} = webkitProgress();
  for (const status of [{downloaded:NaN,total:100},{downloaded:100,total:Infinity},{downloaded:10,total:-1}]) {
    setNativeProgressValue(element,downloadPercent(status));
    assert.equal(attributes.has('value'),false);
  }
  setNativeProgressValue(element,NaN);
  setNativeProgressValue(element,Infinity);
  assert.equal(attributes.has('value'),false);
  assert.equal(downloadPercent({downloaded:-1,total:100}),0);
});
