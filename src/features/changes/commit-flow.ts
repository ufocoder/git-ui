import type { CommitOptions, CommitPushTarget, History } from "../../lib/git-types";

export type CommitRequest = {
  message: string;
  options: CommitOptions;
  amend?: { head: string; branch: string; confirmed: boolean };
  push?: { remote: string };
};

export type CommitFlowState =
  | { kind: "idle" | "committing" | "pushing" }
  | { kind: "done" }
  | { kind: "pushFailed"; target: CommitPushTarget; error: unknown };

type CommitPort = {
  commit: (request: CommitRequest) => Promise<History>;
  push: (target: CommitPushTarget) => Promise<History>;
  readHistory: () => Promise<History>;
};

export function matchesPushTarget(project: History, target: CommitPushTarget) {
  if (project.path !== target.path || project.current_branch !== target.branch || project.tip !== target.tip) return false;
  if (target.upstream) return project.sync.upstream === target.upstream;
  return !project.sync.upstream || project.sync.upstream === `${target.remote}/${target.branch}`;
}

export function createCommitFlow(api: CommitPort, onState: (state: CommitFlowState) => void) {
  let state: CommitFlowState = { kind: "idle" };
  function transition(next: CommitFlowState) {
    state = next;
    onState(next);
  }

  async function push(history: History, target: CommitPushTarget) {
    transition({ kind: "pushing" });
    try {
      const updated = await api.push(target);
      transition({ kind: "done" });
      return updated;
    } catch (error) {
      transition({ kind: "pushFailed", target, error });
      return history;
    }
  }

  return {
    async submit(request: CommitRequest) {
      const previous = state;
      transition({ kind: "committing" });
      let history: History;
      try {
        history = await api.commit(request);
      } catch (error) {
        transition(previous);
        throw error;
      }
      if (!request.push) {
        transition({ kind: "done" });
        return history;
      }
      return push(history, {
        path: history.path,
        branch: history.current_branch,
        tip: history.tip,
        upstream: history.sync.upstream,
        remote: request.push.remote,
      });
    },
    async retry() {
      if (state.kind !== "pushFailed") return;
      const target = state.target;
      const history = await api.readHistory();
      if (!matchesPushTarget(history, target)) return history;
      return push(history, target);
    },
    dismiss() {
      transition({ kind: "idle" });
    },
  };
}
