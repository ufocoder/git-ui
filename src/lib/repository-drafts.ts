import { createSignal } from "solid-js";
import type { ConflictFile, HistoryFilter } from "./git";

// Data survives mode changes without retaining inactive component trees.
export function createCommitDraft() {
  return {
    message: createSignal(""),
    sign: createSignal(false),
    amendTarget: createSignal<{ head: string; branch: string }>(),
    amendConfirmed: createSignal(false),
    newCommitMessage: createSignal(""),
    pushRemote: createSignal(""),
    pushAfterCommit: createSignal(false),
  };
}
export type CommitDraft = ReturnType<typeof createCommitDraft>;

export function createConflictDraft() {
  return {
    selected: createSignal(""),
    data: createSignal<ConflictFile>(),
    text: createSignal(""),
    choice: createSignal<"manual" | "ours" | "theirs">("manual"),
    resolved: createSignal(false),
  };
}
export type ConflictDraft = ReturnType<typeof createConflictDraft>;

export function createHistorySearch() {
  return {
    open: createSignal(false),
    jumpRef: createSignal(""),
    filter: createSignal<HistoryFilter>({ text: "", sha: "", author: "", file: "" }),
  };
}
export type HistorySearch = ReturnType<typeof createHistorySearch>;
