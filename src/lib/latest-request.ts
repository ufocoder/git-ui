// A request ticket is invalid after a newer request or disposal. It does not
// assume that the underlying transport can cancel work already in progress.
export function latestRequest() {
  let revision = 0, disposed = false;
  return {
    next() { return ++revision; },
    isCurrent(ticket: number) { return !disposed && ticket === revision; },
    dispose() { disposed = true; revision++; },
  };
}
