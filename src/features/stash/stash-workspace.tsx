import { Show, createEffect, createSignal } from "solid-js";
import { t } from "~/lib/i18n";
import type { History, StashAction } from "~/lib/git";
import { Portal } from "solid-js/web";
import StashSection from "./stash-section";
import CommitFiles from "~/components/sections/commit-files";

export default function StashWorkspace(props: { listMount?: HTMLDivElement; actionsMount?: HTMLDivElement; history: History; disabled: boolean; onAction: (action: StashAction) => Promise<void> }) {
  const [selected, setSelected] = createSignal("");
  createEffect(() => {
    if (!props.history.stashes.some(entry => entry.id === selected())) setSelected(props.history.stashes[0]?.id ?? "");
  });
  const entry = () => props.history.stashes.find(item => item.id === selected());
  return <>
    <Show when={props.listMount}><Portal mount={props.listMount}>
      <StashSection actionsMount={props.actionsMount} history={props.history} selected={selected()} onSelect={saved => setSelected(saved.id)} disabled={props.disabled} onAction={props.onAction} />
    </Portal></Show>
      <Show when={entry()} fallback={<p class="p-6 text-sm text-muted-foreground">{t("stash03")}</p>}>{saved =>
        <CommitFiles stash commit={{ hash: saved().id, subject: saved().message, author: saved().reference, date: saved().date, parents: [], refs: [] }} disabled={props.disabled} />
      }</Show>
  </>;
}
