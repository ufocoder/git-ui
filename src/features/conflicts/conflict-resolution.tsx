import { FileViewToggle } from "~/components/ui/file-view-toggle";
import { readFilePresentation, saveFilePresentation } from "~/lib/file-presentation";
import FileTableHeader from "~/components/sections/file-table-header";
import { changedLineBlocks, conflictMarkerBlocks } from "~/lib/conflict-lines";
import { PanelHeader } from "~/components/ui/panel-header";
import { FilePathLabel } from "~/components/ui/file-path-label";
import ConflictCode from "./conflict-code";
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { createConflictDraft, type ConflictDraft } from "~/lib/repository-drafts";
import { t } from "~/lib/i18n";
import { git, type ConflictVersion, type History } from "~/lib/git";
import { Button } from "~/components/ui/button";
import { Resizable, ResizableHandle, ResizablePanel } from "~/components/ui/resizable";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import ChangedFilesTree from "~/components/sections/changed-files-tree";

type Props = {
  draft?: ConflictDraft;
  history: History;
  disabled: boolean;
  onHistoryChange: (history: History) => void;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
  onCreateCommit: () => void;
};
export default function ConflictResolution(props: Props) {
  const [presentation, setPresentation] = createSignal(readFilePresentation());
  const state = props.draft ?? createConflictDraft();
  const [selected, setSelected] = state.selected;
  const [data, setData] = state.data;
  const [draft, setDraft] = state.text;
  const [choice, setChoice] = state.choice;
  const [loading, setLoading] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [navigation, setNavigation] = createSignal<{ kind: "file"; path: string } | { kind: "refresh" }>();
  const [resolved, setResolved] = state.resolved;
  const [currentBlock, setCurrentBlock] = createSignal(0);
  const [navigationTick, setNavigationTick] = createSignal(0);
  const blockCount = createMemo(() => {
    const file = data();
    if (!file) return 0;
    const base = file.base.exists ? file.base.text : "";
    return Math.max(conflictMarkerBlocks(file.working_text ?? "").length,
      changedLineBlocks(base ?? "", file.ours.text ?? "").length,
      changedLineBlocks(base ?? "", file.theirs.text ?? "").length);
  });
  function navigateBlock(index: number) {
    setCurrentBlock(Math.max(0, Math.min(index, blockCount() - 1)));
    setNavigationTick(value => value + 1);
  }
  const dirty = createMemo(() => Boolean(data()) && (choice() !== "manual" || draft() !== (data()?.working_text ?? "")));
  const disabled = () => props.disabled || pending() || loading();
  const chosenVersion = () => choice() === "ours" ? data()?.ours : choice() === "theirs" ? data()?.theirs : undefined;
  const deleting = () => Boolean(chosenVersion()) && !chosenVersion()!.exists;
  let loadedPath = data()?.file.path ?? "";
  let generation = 0;
  let mounted = true;
  onCleanup(() => { mounted = false; generation++; });
  createEffect(() => {
    const files = props.history.conflicts ?? [];
    if (!files.some(file => file.path === selected())) setSelected(files[0]?.path ?? "");
  });
  createEffect(() => {
    const path = selected();
    if (path && loadedPath !== path) void load(path);
    else if (!path) { loadedPath = ""; generation++; setData(undefined); setDraft(""); setLoading(false); }
  });
  async function load(path: string) {
    loadedPath = path;
    setCurrentBlock(0);
    const request = ++generation;
    setLoading(true); setData(undefined); setChoice("manual"); setDraft("");
    try {
      const result = await git.getConflictFile(path);
      if (mounted && request === generation) { setData(result); setDraft(result.working_text ?? ""); }
    } catch { /* Errors are shown in the terminal. */ }
    finally { if (mounted && request === generation) setLoading(false); }
  }
  function selectFile(path: string) {
    if (props.disabled || pending() || path === selected()) return;
    if (dirty()) setNavigation({ kind: "file", path });
    else setSelected(path);
  }
  async function refresh() {
    if (props.disabled || pending()) return;
    if (dirty()) { setNavigation({ kind: "refresh" }); return; }
    setData(undefined); await props.onRefresh();
    if (selected()) await load(selected());
  }
  async function discardDraft() {
    const next = navigation(); setNavigation(undefined); setData(undefined); setDraft("");
    if (next?.kind === "file") setSelected(next.path);
    else if (next?.kind === "refresh") await refresh();
  }
  function choose(side: "ours" | "theirs") {
    const value = data()?.[side];
    if (!value || disabled()) return;
    setChoice(side);
    if (data()?.editable && value.exists && value.text !== null) setDraft(value.text);
  }
  async function save() {
    const current = data();
    if (!current || disabled() || !current.supported || (choice() === "manual" && !current.editable)) return;
    setPending(true); props.onBusyChange(true);
    try {
      const result = await git.resolveConflict(current.file.path, current.token, choice() === "manual" ? { kind: "manual", content: draft() } : { kind: choice() as "ours" | "theirs" });
      if (!mounted) return;
      setData(undefined); setDraft(""); setResolved(true); props.onHistoryChange(result);
    } catch { /* Preserve the draft; the terminal explains the failure. */ }
    finally { setPending(false); props.onBusyChange(false); }
  }
  return <div class="flex h-full min-h-0 flex-col">

    <Show when={props.history.conflicts?.length} fallback={
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p class="text-base font-medium">{t("conflict.empty")}</p>
        <Show when={resolved()}><p class="text-sm text-muted-foreground">{t("conflict.staged")}</p></Show>
        <Show when={resolved() && props.history.has_changes && !props.history.operation}><Button variant="outline" onClick={props.onCreateCommit}>{t("conflict.commit")}</Button></Show>
      </div>
    }>
      <Resizable layoutId="conflicts.columns" orientation="horizontal" initialSizes={[0.25, 0.75]} class="min-h-0 flex-1">
        <ResizablePanel minSize={0.15} class="flex min-h-0 min-w-0 flex-col overflow-hidden">
    <PanelHeader class="h-[var(--panel-header-height)] px-4">
      <h2>{props.history.operation ? t("conflict.title") : t("conflict.count", { count: props.history.conflicts?.length ?? 0 })}</h2>
      <div class="flex shrink-0 items-center gap-1"><FileViewToggle value={presentation().view} onChange={view => { const value = { ...presentation(), view }; setPresentation(value); saveFilePresentation(value); }} />
      <Button size="icon" variant="ghost" class="size-7" disabled={props.disabled || pending()} aria-label={t("operation.refresh")} title={t("operation.refresh")} onClick={() => void refresh()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></svg>
      </Button></div>
    </PanelHeader>
          <div data-file-scroll class="min-h-0 flex-1 overflow-auto" classList={{ "p-3": presentation().view === "tree" }}>
            <Show when={presentation().view === "list"}><FileTableHeader class="px-3" presentation={presentation()} onPresentationChange={value => { setPresentation(value); saveFilePresentation(value); }} /></Show>
            <ChangedFilesTree virtual presentation={presentation()} files={props.history.conflicts ?? []} selectedPath={selected()} disabled={props.disabled || pending()} onSelect={file => selectFile(file.path)} /></div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label={t("details.resize")} />
        <ResizablePanel minSize={0.4} class="min-h-0 min-w-0 overflow-hidden">
          <Show when={!loading()} fallback={<p class="p-4 text-sm text-muted-foreground" role="status">{t("details.loading-diff")}</p>}>
            <Show when={data()} fallback={<p class="p-4 text-sm text-muted-foreground">{t("conflict.select-file")}</p>}>{current => <section class="flex h-full min-h-0 flex-col">
              <PanelHeader class="h-[var(--panel-header-height)] flex-nowrap overflow-x-auto px-3">
                <h3 class="flex min-w-0 flex-1"><FilePathLabel path={current().file.path} /></h3>
                <div class="flex shrink-0 items-center gap-1">
                  <Show when={blockCount() > 0}>
                    <Button size="icon" variant="ghost" class="size-7" disabled={currentBlock() === 0} aria-label={t("conflict-nav.previous")} onClick={() => navigateBlock(currentBlock() - 1)}>↑</Button>
                    <Button size="sm" variant="ghost" class="h-7 text-xs tabular-nums" title={t("conflict-nav.current")} onClick={() => navigateBlock(currentBlock())}>{t("conflict.block-count", { count: currentBlock() + 1, total: blockCount() })}</Button>
                    <Button size="icon" variant="ghost" class="size-7" disabled={currentBlock() >= blockCount() - 1} aria-label={t("conflict-nav.next")} onClick={() => navigateBlock(currentBlock() + 1)}>↓</Button>
                  </Show>
                </div>
              </PanelHeader>
              <Resizable layoutId="conflicts.result" orientation="vertical" initialSizes={[0.45, 0.55]} class="min-h-0 flex-1">
                <ResizablePanel minSize={0.15} class="min-h-0 overflow-hidden">
                  <div class="grid h-full min-h-0 grid-cols-2 divide-x">
                    <ConflictSide current={currentBlock()} navigation={navigationTick()} identity={`${current().file.path}:ours`} base={current().base.exists ? current().base.text : ""} title={t("conflict.ours")} version={current().ours} disabled={disabled() || !current().supported} onChoose={() => choose("ours")} button={t("conflict.use-ours")} />
                    <ConflictSide current={currentBlock()} navigation={navigationTick()} identity={`${current().file.path}:theirs`} base={current().base.exists ? current().base.text : ""} title={t("conflict.theirs")} version={current().theirs} disabled={disabled() || !current().supported} onChoose={() => choose("theirs")} button={t("conflict.use-theirs")} />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle aria-label={t("conflict.result")} />
                <ResizablePanel minSize={0.25} class="flex min-h-0 flex-col overflow-hidden">
                  <Show when={current().editable && !deleting() && (choice() === "manual" || chosenVersion()?.text !== null)} fallback={
                    <div class="min-h-0 flex-1 overflow-auto bg-muted/30 p-3 text-sm text-muted-foreground">
                      {!current().supported ? t("conflict.unsupported") : deleting() ? t("conflict.delete-description") : choice() === "ours" ? t("conflict.ours-selected") : choice() === "theirs" ? t("conflict.theirs-selected") : t("conflict.readonly")}
                    </div>
                  }>
                    <ConflictCode current={currentBlock()} navigation={navigationTick()} identity={`${current().file.path}:result`} text={draft()} base={current().base.exists ? current().base.text : ""} label={t("conflict.result")} tone="result" editable disabled={disabled()} onChange={value => { setChoice("manual"); setDraft(value); }} />
                  </Show>
                  <div class="panel-actions flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
                    <p class="text-xs text-muted-foreground">{t("conflict.save-description")}</p>
                    <Button size="sm" class="h-control-toolbar px-control-sm-x" variant={deleting() ? "destructive" : "default"} disabled={disabled() || !current().supported || (choice() === "manual" && !current().editable)} onClick={() => void save()}>{pending() ? t("common.saving") : deleting() ? t("conflict.delete-and-resolve") : t("conflict.save")}</Button>
                  </div>
                </ResizablePanel>
              </Resizable>
            </section>}</Show>
          </Show>
        </ResizablePanel>
      </Resizable>
    </Show>
    <Dialog open={Boolean(navigation())} onOpenChange={value => { if (!value) setNavigation(undefined); }}>
      <DialogContent><DialogHeader><DialogTitle>{t("conflict.discard-title")}</DialogTitle><DialogDescription>{t("conflict.discard-description")}</DialogDescription></DialogHeader>
        <DialogFooter class="gap-2"><Button variant="outline" onClick={() => setNavigation(undefined)}>{t("common.cancel")}</Button><Button variant="destructive" onClick={() => void discardDraft()}>{t("conflict.discard")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ConflictSide(props: { current: number; navigation: number; identity: string; base: string | null; title: string; version: ConflictVersion; button: string; disabled: boolean; onChoose: () => void }) {
  return <div class="flex min-h-0 min-w-0 flex-col">
    <PanelHeader class="flex-wrap gap-1 px-2"><h4 class="text-xs font-medium">{props.title}</h4><Button size="sm" variant="outline" class="h-7 text-xs" disabled={props.disabled} onClick={props.onChoose}>{props.button}</Button></PanelHeader>
    <Show when={props.version.exists && !props.version.large && !props.version.binary && props.version.mode !== "120000" && props.version.text !== null} fallback={
      <pre class="min-h-0 flex-1 overflow-auto bg-muted/20 p-3 font-mono text-diff leading-diff">{!props.version.exists ? t("conflict.deleted") : props.version.large ? t("conflict.large") : props.version.binary ? t("conflict.binary") : props.version.mode === "120000" ? t("conflict.symlink") : t("conflict.unsupported")}</pre>
    }>
      <ConflictCode current={props.current} navigation={props.navigation} identity={props.identity} text={props.version.text ?? ""} base={props.base} label={props.title} tone={props.identity.endsWith(":ours") ? "ours" : "theirs"} />
    </Show>
  </div>;
}
