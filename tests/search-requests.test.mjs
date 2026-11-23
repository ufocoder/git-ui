import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchRequests } from '../src/lib/search-requests.ts';
function fixture() {
  const pending = new Map(), cancelled = [];
  let sequence = 0;
  const requests = createSearchRequests((id, query) => new Promise((resolve, reject) => pending.set(query, { id, resolve, reject })), async id => { cancelled.push(id); }, () => String(++sequence));
  return { requests, pending, cancelled };
}
test('replacing a search cancels its exact request, not the newer search', async () => {
  const f = fixture();
  const first = f.requests.run('old'), latest = f.requests.run('new');
  assert.deepEqual(f.cancelled, ['1']);
  f.pending.get('old').resolve('old result'); await first;
  f.requests.cancel();
  assert.deepEqual(f.cancelled, ['1', '2']);
  f.pending.get('new').resolve('new result'); assert.equal(await latest, 'new result');
});
test('completed requests are not cancelled and each new query gets an identity', async () => {
  const f = fixture(); const first = f.requests.run('one');
  f.pending.get('one').resolve('done'); await first;
  f.requests.cancel(); assert.deepEqual(f.cancelled, []);
  const second = f.requests.run('two'); assert.equal(f.pending.get('two').id, '2');
  f.pending.get('two').reject(new Error('failed')); await assert.rejects(second, /failed/);
  f.requests.cancel(); assert.deepEqual(f.cancelled, []);
});
test('a delayed cancellation failure does not replace the new result', async () => {
  let sequence = 0;
  const request = createSearchRequests(async (_id, query) => query, async () => { throw new Error('closed IPC'); }, () => String(++sequence));
  const first = request.run('first'), second = request.run('second');
  assert.equal(await first, 'first'); assert.equal(await second, 'second');
});
