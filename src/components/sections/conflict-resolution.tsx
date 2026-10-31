import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { t } from "~/lib/i18n";
import { git, type ConflictFile, type ConflictVersion, type History } from "~/lib/git";
import { Button } from "~/components/ui/button";
import { Resizable, ResizableHandle, ResizablePanel } from "~/components/ui/resizable";
import { TextField, TextFieldLabel, TextFieldTextArea } from "~/components/ui/text-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import ChangedFilesTree from "./changed-files-tree";

type Props = {
  history: History;
  active: boolean;
  disabled: boolean;
  onHistoryChange: (history: History) => void;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
  onCreateCommit: () => void;
};
export default function ConflictResolution(props: Props) {
  const [selected, setSelected] = createSignal("");
  const [data, setData] = createSignal<ConflictFile>();
  const [draft, setDraft] = createSignal("");
  const [choice, setChoice] = createSignal<"manual" | "ours" | "theirs">("manual");
  const [loading, setLoading] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [navigation, setNavigation] = createSignal<{ kind: "file"; path: string } | { kind: "refresh" }>();
  const [resolved, setResolved] = createSignal(false);
  const dirty = createMemo(() => Boolean(data()) && (choice() !== "manual" || draft() !== (data()?.working_text ?? "")));
  const disabled = () => props.disabled || pending() || loading();
  const chosenVersion = () => choice() === "ours" ? data()?.ours : choice() === "theirs" ? data()?.theirs : undefined;
  const deleting = () => Boolean(chosenVersion()) && !chosenVersion()!.exists;
  let loadedPath = "";
  let generation = 0;
  let mounted = true;
  onCleanup(() => { mounted = false; generation++; });
  createEffect(() => {
    const files = props.history.conflicts ?? [];
    if (!files.some(file => file.path === selected())) setSelected(files[0]?.path ?? "");
  });
  createEffect(() => {
    const path = selected();
    if (props.active && path && loadedPath !== path) void load(path);
    else if (!path) { loadedPath = ""; generation++; setData(undefined); setDraft(""); setLoading(false); }
  });
  async function load(path: string) {
    loadedPath = path;
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
    if (selected() && props.active) await load(selected());
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
    <header class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
      <h2 class="text-sm font-medium">{t("conf12", { count: props.history.conflicts?.length ?? 0 })}</h2>
      <Button size="sm" variant="ghost" disabled={props.disabled || pending()} onClick={() => void refresh()}>{t("op28")}</Button>
    </header>
    <Show when={props.history.conflicts?.length} fallback={
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p class="text-base font-medium">{t("conf10")}</p>
        <Show when={resolved()}><p class="text-sm text-muted-foreground">{t("conf29")}</p></Show>
        <Show when={resolved() && props.history.has_changes && !props.history.operation}><Button variant="outline" onClick={props.onCreateCommit}>{t("conf30")}</Button></Show>
      </div>
    }>
      <Resizable orientation="horizontal" initialSizes={[0.25, 0.75]} class="min-h-0 flex-1">
        <ResizablePanel minSize={0.15} class="min-h-0 min-w-0 overflow-auto p-3">
          <ChangedFilesTree files={props.history.conflicts ?? []} selectedPath={selected()} disabled={props.disabled || pending()} onSelect={file => selectFile(file.path)} />
        </ResizablePanel>
        <ResizableHandle withHandle aria-label={t("cf11")} />
        <ResizablePanel minSize={0.4} class="min-h-0 min-w-0 overflow-hidden">
          <Show when={!loading()} fallback={<p class="p-4 text-sm text-muted-foreground" role="status">{t("cf13")}</p>}>
            <Show when={data()} fallback={<p class="p-4 text-sm text-muted-foreground">{t("conf11")}</p>}>{current => <section class="flex h-full min-h-0 flex-col gap-3 p-4">
              <h3 class="shrink-0 break-all font-mono text-sm font-semibold">{current().file.path}</h3>
              <Resizable orientation="vertical" initialSizes={[0.45, 0.55]} class="min-h-0 flex-1">
                <ResizablePanel minSize={0.15} class="min-h-0 overflow-hidden pb-3">
                  <div class="grid h-full min-h-0 grid-cols-2 gap-3">
                    <ConflictSide title={t("conf02")} version={current().ours} disabled={disabled() || !current().supported} onChoose={() => choose("ours")} button={t("conf05")} />
                    <ConflictSide title={t("conf03")} version={current().theirs} disabled={disabled() || !current().supported} onChoose={() => choose("theirs")} button={t("conf06")} />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle aria-label={t("conf04")} />
                <ResizablePanel minSize={0.25} class="flex min-h-0 flex-col gap-3 overflow-hidden pt-3">
                  <Show when={current().editable && !deleting() && (choice() === "manual" || chosenVersion()?.text !== null)} fallback={
                    <div class="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                      {!current().supported ? t("conf17") : deleting() ? t("conf13") : choice() === "ours" ? t("conf27") : choice() === "theirs" ? t("conf28") : t("conf18")}
                    </div>
                  }>
                    <TextField class="min-h-0 flex-1" value={draft()} onChange={value => { setChoice("manual"); setDraft(value); }} disabled={disabled()}>
                      <TextFieldLabel>{t("conf04")}</TextFieldLabel>
                      <TextFieldTextArea class="min-h-0 flex-1 resize-none whitespace-pre font-mono text-xs leading-4" wrap="off" spellcheck={false} />
                    </TextField>
                  </Show>
                  <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <p class="text-xs text-muted-foreground">{t("conf32")}</p>
                    <Button variant={deleting() ? "destructive" : "default"} disabled={disabled() || !current().supported || (choice() === "manual" && !current().editable)} onClick={() => void save()}>{pending() ? t("add10") : deleting() ? t("conf23") : t("conf07")}</Button>
                  </div>
                </ResizablePanel>
              </Resizable>
            </section>}</Show>
          </Show>
        </ResizablePanel>
      </Resizable>
    </Show>
    <Dialog open={Boolean(navigation())} onOpenChange={value => { if (!value) setNavigation(undefined); }}>
      <DialogContent><DialogHeader><DialogTitle>{t("conf20")}</DialogTitle><DialogDescription>{t("conf21")}</DialogDescription></DialogHeader>
        <DialogFooter class="gap-2"><Button variant="outline" onClick={() => setNavigation(undefined)}>{t("add09")}</Button><Button variant="destructive" onClick={() => void discardDraft()}>{t("conf22")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ConflictSide(props: { title: string; version: ConflictVersion; button: string; disabled: boolean; onChoose: () => void }) {
  return <div class="flex min-h-0 min-w-0 flex-col gap-2">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2"><h4 class="text-xs font-medium">{props.title}</h4><Button size="sm" variant="outline" class="h-7 text-xs" disabled={props.disabled} onClick={props.onChoose}>{props.button}</Button></div>
    <pre class="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 p-3 font-mono text-[11px] leading-4">{!props.version.exists ? t("conf08") : props.version.large ? t("conf24") : props.version.binary ? t("conf09") : props.version.mode === "120000" ? t("conf31") : props.version.text ?? t("conf17")}</pre>
  </div>;
}
