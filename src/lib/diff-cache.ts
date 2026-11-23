import { createTaskQueue } from "./task-queue.ts";

export type DiffRequest = { project: string; commit: string; path: string; stash?: boolean; scope?: string; revision?: object };
// Immutable objects can be reused across selections. Worktree entries require
// the exact file snapshot, so staging and filesystem refreshes invalidate them.
export function createDiffCache<T>(fetch: (request: DiffRequest) => Promise<T>, size: (value: T) => number, budget = 20 * 1024 * 1024, capacity = 24) {
  const queue = createTaskQueue(2);
  const entries = new Map<string, { revision?: object; value: T; bytes: number }>();
  const pending = new Map<string, { revision?: object; promise: Promise<T>; subscribers: (() => boolean)[] }>();
  let bytes = 0;
  const key = (request: DiffRequest) => JSON.stringify([request.project, request.commit, request.path, !!request.stash, request.scope]);
  const revision = (request: DiffRequest) => request.commit === "WORKTREE" ? request.revision : undefined;
  const cacheable = (request: DiffRequest) => request.commit !== "WORKTREE" || !!request.revision;
  function remove(id: string) { const entry = entries.get(id); if (entry) bytes -= entry.bytes; entries.delete(id); }
  function peek(request: DiffRequest): T | undefined {
    const id = key(request), entry = entries.get(id);
    if (!cacheable(request) || !entry) return;
    if (entry.revision !== revision(request)) { remove(id); return; }
    entries.delete(id); entries.set(id, entry);
    return entry.value;
  }
  function load(request: DiffRequest, valid = () => true): Promise<T> {
    const cached = peek(request);
    if (cached !== undefined) return Promise.resolve(cached);
    const id = key(request), version = revision(request), previous = pending.get(id);
    if (cacheable(request) && previous && previous.revision === version) { previous.subscribers.push(valid); return previous.promise; }
    const subscribers = [valid];
    const job = { revision: version, subscribers, promise: undefined as unknown as Promise<T> };
    job.promise = queue.run(() => fetch(request), () => subscribers.some(check => check())).then(value => {
      // An obsolete response must never replace a newer worktree snapshot.
      if (cacheable(request) && pending.get(id) === job) {
        const weight = size(value);
        remove(id);
        if (weight <= budget) { entries.set(id, { revision: version, value, bytes: weight }); bytes += weight; }
        while (entries.size > capacity || bytes > budget) remove(entries.keys().next().value!);
      }
      return value;
    }).finally(() => { if (pending.get(id) === job) pending.delete(id); });
    pending.set(id, job);
    return job.promise;
  }
  return { peek, load };
}
