export function createRepositoryOperation<History>(options: {
  busy: () => boolean;
  setBusy: (busy: boolean) => void;
  setHistory: (history: History) => void;
  readHistory: () => Promise<History>;
  openTerminal: () => void;
  busyError: () => Error;
}) {
  return async function run(
    operation: () => Promise<History>,
    policy: {
      refreshOnError?: boolean;
      openTerminalOnError?: boolean;
      acceptRecovered?: (history: History) => boolean;
      onSuccess?: (history: History) => void;
    } = {},
  ) {
    if (options.busy()) throw options.busyError();
    options.setBusy(true);
    try {
      const history = await operation();
      if (policy.onSuccess) policy.onSuccess(history);
      else options.setHistory(history);
    } catch (error) {
      if (policy.openTerminalOnError) options.openTerminal();
      if (policy.refreshOnError) {
        const history = await options.readHistory().catch(() => undefined);
        if (history !== undefined) {
          options.setHistory(history);
          if (policy.acceptRecovered?.(history)) return;
        }
      }
      throw error;
    } finally {
      options.setBusy(false);
    }
  };
}
