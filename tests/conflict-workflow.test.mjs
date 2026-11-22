import assert from 'node:assert/strict';
import test from 'node:test';
import { createConflictAnalyzer } from '../src/lib/conflict-model.ts';
import { createConflictSession } from '../src/lib/conflict-session.ts';
import { latestRequest } from '../src/lib/latest-request.ts';
import { createConflictAnalysisClient } from '../src/lib/conflict-analysis-client.ts';
import { changedLineEdits } from '../src/lib/conflict-lines.ts';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const source = { base: 'a\nb\nc\nd\ne\nf', ours: 'insert\na\nb\nc\nours\ne\nf', theirs: 'a\nb\nc\ntheirs\ne\nf' };

test('one navigation index maps the same change after unequal insertions', () => {
  const analyze = createConflictAnalyzer();
  const { analysis } = analyze({ id: 1, source, text: 'a\nb\nc\nresolved\ne\nf' });
  assert.equal(analysis.targets.length, 2);
  assert.deepEqual(analysis.targets[1], { ours: { start: 4, end: 4 }, theirs: { start: 3, end: 3 }, result: { start: 3, end: 3 } });
  const updated = analyze({ id: 2, text: 'extra\na\nb\nc\nresolved\ne\nf' }).analysis;
  assert.deepEqual(updated.targets[1].result, { start: 4, end: 4 });
  assert.deepEqual(updated.targets[1].ours, analysis.targets[1].ours);
});

test('deleted sections keep a valid anchor and add/add conflicts share a region', () => {
  const analyze = createConflictAnalyzer();
  const { analysis } = analyze({ id: 1, source: { base: 'a\nb\nc\nd', ours: 'a\nc\nd', theirs: 'a\nother\nc\nd' }, text: 'a\nc\nd' });
  assert.deepEqual(analysis.targets[0].ours, { start: 1, end: 1 });
  const added = analyze({ id: 2, source: { base: '', ours: 'ours', theirs: 'theirs' }, text: 'resolved' });
  assert.equal(added.analysis.targets.length, 1);
});

test('fast file switching and closing never publish an older load or analysis', async () => {
  const a = deferred(), b = deferred();
  const session = createConflictSession({ getConflictFile: path => path === 'a' ? a.promise : b.promise });
  const first = session.load('a'), second = session.load('b');
  b.resolve({ token: 'b' }); assert.deepEqual(await second, { token: 'b' });
  a.resolve({ token: 'a' }); assert.equal(await first, undefined);
  const pending = deferred();
  const closing = createConflictSession({ getConflictFile: () => pending.promise });
  const load = closing.load('a'); closing.dispose(); pending.resolve({ token: 'a' });
  assert.equal(await load, undefined);
  const requests = latestRequest();
  const stale = requests.next(), current = requests.next();
  assert.equal(requests.isCurrent(stale), false);
  assert.equal(requests.isCurrent(current), true);
  requests.dispose(); assert.equal(requests.isCurrent(current), false);
});

test('manual resolution saves the exact full draft and stale-save failure preserves it', async () => {
  const calls = [], history = { conflicts: [] };
  const session = createConflictSession({ resolveConflict: async (...args) => { calls.push(args); return history; } });
  const text = 'manual\r\n' + 'unchanged\n'.repeat(10000) + 'tail without newline';
  const file = { file: { path: 'nested/file.txt' }, token: 'snapshot-token' };
  assert.equal(await session.save(file, 'manual', text), history);
  assert.deepEqual(calls[0], ['nested/file.txt', 'snapshot-token', { kind: 'manual', content: text }]);
  await session.save(file, 'ours', text);
  assert.deepEqual(calls[1][2], { kind: 'ours' });
  const stale = createConflictSession({ resolveConflict: async () => { throw new Error('stale token'); } });
  await assert.rejects(stale.save(file, 'manual', text), /stale token/);
  assert.equal(text.endsWith('tail without newline'), true);
});

test('large source analysis is reused while result edits retain aligned regions', () => {
  const base = Array.from({ length: 10000 }, (_, index) => `line ${index}`);
  const ours = [...base], theirs = [...base]; ours[100] = 'ours'; theirs[9000] = 'theirs';
  const analyze = createConflictAnalyzer();
  const first = analyze({ id: 1, source: { base: base.join('\n'), ours: ours.join('\n'), theirs: theirs.join('\n') }, text: base.join('\n') });
  const second = analyze({ id: 2, text: ['new', ...base].join('\n') });
  assert.equal(first.analysis.ours, second.analysis.ours);
  assert.equal(first.analysis.theirs, second.analysis.theirs);
  assert.equal(second.analysis.targets[1].result.start, 9001);
});

test('worker responses from previous files are ignored and pending typing survives worker failure', async () => {
  const messages = [], published = [];
  let receive, fail, terminated = false;
  const client = createConflictAnalysisClient((analysis, source) => published.push({ analysis, source }), (onResult, onFailure) => {
    receive = onResult; fail = onFailure;
    return { send: request => messages.push(request), dispose: () => { terminated = true; } };
  }, 10);
  client.setSource(source, source.base);
  const first = messages[0];
  const next = { ...source, ours: 'a\nb\nc\nsecond\ne\nf' };
  client.setSource(next, next.base);
  const obsolete = createConflictAnalyzer()(first);
  receive(obsolete);
  assert.equal(published.at(-1).analysis, undefined);
  client.setText('new\na\nb\nc\nresolved\ne\nf');
  fail();
  assert.equal(terminated, true);
  assert.equal(published.at(-1).source, next);
  assert.deepEqual(published.at(-1).analysis.targets[0].result, { start: 4, end: 4 });
  const count = published.length;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(published.length, count);
  client.dispose(); receive(obsolete);
  assert.equal(published.length, count);
});

test('line edits reconstruct insertions, deletions and replacements with repeated content', () => {
  let seed = 29;
  const random = max => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  for (let trial = 0; trial < 200; trial++) {
    const base = Array.from({ length: 12 }, () => `line ${random(4)}`);
    const result = [...base];
    for (let edit = 0; edit < 4; edit++) result.splice(random(result.length + 1), random(3), ...Array.from({ length: random(3) }, () => `new ${random(4)}`));
    const edits = changedLineEdits(base.join('\n'), result.join('\n'));
    const rebuilt = []; let cursor = 0;
    for (const edit of edits) {
      assert.ok(edit.baseStart >= cursor);
      rebuilt.push(...base.slice(cursor, edit.baseStart), ...result.slice(edit.start, edit.end));
      cursor = edit.baseEnd;
    }
    rebuilt.push(...base.slice(cursor));
    assert.deepEqual(rebuilt, result);
  }
});
