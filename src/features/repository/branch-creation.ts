import { createSignal, type Accessor, type Setter } from "solid-js";
import { referencesApi } from "~/lib/git-api/references";
import { historyApi } from "~/lib/git-api/history";
import type { History } from "~/lib/git-types";
import { t } from "~/lib/i18n";

export function createBranchCreation(options: { busy: Accessor<boolean>; setBusy: (busy: boolean) => void; setHistory: Setter<History> }) {
  const { busy, setBusy, setHistory } = options;
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [branchName, setBranchName] = createSignal("");
  const [branchError, setBranchError] = createSignal("");
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  async function createBranch(event: SubmitEvent) {
    event.preventDefault();
    if (busy() || creatingBranch()) return;
    const name = branchName().trim();
    if (!name) { setBranchError(t("app.branch-required")); return; }
    setCreatingBranch(true);
    setBusy(true);
    setBranchError("");
    try {
      setHistory(await referencesApi.createBranch(name));
      setBranchDialogOpen(false);
      setBranchName("");
    } catch {
      setBranchDialogOpen(false);
      try { setHistory(await historyApi.getHistory()); } catch { /* Keep the last loaded history. */ }
    } finally { setCreatingBranch(false); setBusy(false); }
  }

  return { branchDialogOpen, setBranchDialogOpen, branchName, setBranchName, branchError, setBranchError, creatingBranch, createBranch };
}
