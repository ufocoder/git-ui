// Only the newest request can own cancellation. An older response or cancel
// message must never stop a newer request that has already started.
export const SEARCH_CANCELLED = "__history_search_cancelled__";
export function createSearchRequests<Args, Result>(
  send: (id: string, args: Args) => Promise<Result>,
  stop: (id: string) => Promise<void>,
  nextId = () => crypto.randomUUID(),
) {
  let active: string | undefined;
  function cancel() {
    const id = active;
    active = undefined;
    if (id) void stop(id).catch(() => { /* Superseded responses remain ignored even if IPC closes. */ });
  }
  return {
    cancel,
    async run(args: Args): Promise<Result> {
      cancel();
      const id = nextId(); active = id;
      try { return await send(id, args); }
      finally { if (active === id) active = undefined; }
    },
  };
}
