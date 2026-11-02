import { Show, createEffect, createSignal } from "solid-js";
import { t } from "~/lib/i18n";
import type { History, StashAction } from "~/lib/git";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import StashSection from "./stash-section";
import CommitFiles from "./commit-files";

export default function StashWorkspace(props: { history: History; disabled: boolean; onAction: (action: StashAction) => Promise<void> }) {
  const [selected, setSelected] = createSignal("");
  createEffect(() => {
    if (!props.history.stashes.some(entry => entry.id === selected())) setSelected(props.history.stashes[0]?.id ?? "");
  });
  const entry = () => props.history.stashes.find(item => item.id === selected());
  return <Resizable layoutId="stash.columns" orientation="horizontal" initialSizes={[1 / 3, 2 / 3]}>
    <ResizablePanel minSize={0.18} class="min-h-0 overflow-auto">
      <StashSection history={props.history} selected={selected()} onSelect={saved => setSelected(saved.id)} disabled={props.disabled} onAction={props.onAction} />
    </ResizablePanel>
    <ResizableHandle withHandle aria-label={t("cf11")} />
    <ResizablePanel minSize={0.4} class="min-h-0 min-w-0 overflow-hidden">
      <Show when={entry()} fallback={<p class="p-6 text-sm text-muted-foreground">{t("stash03")}</p>}>{saved =>
        <CommitFiles stash commit={{ hash: saved().id, subject: saved().message, author: saved().reference, date: saved().date, parents: [], refs: [] }} disabled={props.disabled} />
      }</Show>
    </ResizablePanel>
  </Resizable>;
}
