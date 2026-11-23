export const TASK_CANCELLED = "__background_task_cancelled__";
export function createTaskQueue(limit = 2) {
  limit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 2;
  let running = 0;
  const waiting: (() => void)[] = [];
  function pump() { while (running < limit && waiting.length) waiting.shift()!(); }
  return {
    run<T>(task: () => Promise<T>, valid = () => true): Promise<T> {
      return new Promise((resolve, reject) => {
        waiting.push(() => {
          if (!valid()) { reject(new Error(TASK_CANCELLED)); return; }
          running++;
          void Promise.resolve().then(task).then(resolve, reject).finally(() => { running--; pump(); });
        });
        pump();
      });
    },
  };
}
