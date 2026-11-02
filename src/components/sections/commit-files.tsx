import { locale, t } from "~/lib/i18n";
import { Show, createEffect, createSignal, onCleanup, on, createMemo } from "solid-js";
import { git, type Commit, type CommitFile, type FileDiff } from "~/lib/git";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import { Separator } from "~/components/ui/separator";
import FileDiffView from "~/components/sections/file-diff-view";

import ChangedFilesTree from "./changed-files-tree";

export default function CommitFiles(props: { commit: Commit; stash?: boolean; disabled: boolean }) {
  const [message, setMessage] = createSignal("");
  const [files, setFiles] = createSignal<CommitFile[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [opening, setOpening] = createSignal(false);
  const [selectedFile, setSelectedFile] = createSignal("");
  const [diff, setDiff] = createSignal<FileDiff>();
  let diffRequest = 0;
  let generation = 0;
  createEffect(on(createMemo(() => `${props.commit.hash}:${Boolean(props.stash)}`), () => {
    const hash = props.commit.hash;
    const request = ++generation;
    diffRequest++; setDiff(undefined); setOpening(false);
    setMessage(props.commit.subject); setFiles([]); setSelectedFile(""); setLoading(true); setError("");
    void (props.stash ? git.getStashDetails(hash) : git.getCommitDetails(hash))
      .then(result => { if (request === generation) { setFiles(result.files); setMessage(result.message); } })
      .catch(e => { if (request === generation) setError(String(e)); })
      .finally(() => { if (request === generation) setLoading(false); });
  }));
  onCleanup(() => { generation++; diffRequest++; });
  async function openFile(file: CommitFile) {
    if (props.disabled) return;
    const request = ++diffRequest;
    setOpening(true); setDiff(undefined); setSelectedFile(file.path);
    try {
      const result = await (props.stash ? git.getStashDiff(props.commit.hash, file.path) : git.getFileDiff(props.commit.hash, file.path));
      if (request === diffRequest) setDiff(result);
    } catch { /* The Git API reports failures in the terminal. */ }
    finally { if (request === diffRequest) setOpening(false); }
  }
  return (
    <Resizable layoutId={props.stash ? "stash.details" : "history.details"} orientation="horizontal" initialSizes={[0.5, 0.5]} class="min-h-0 min-w-0">
      <ResizablePanel minSize={0.2} class="min-h-0 min-w-0 overflow-auto">
        <section class="space-y-4 p-4" aria-label={t("cf01")}>
          <h2 class="text-sm font-medium">{props.stash ? t("mode04") : props.commit.uncommitted ? t("cf02") : t("cf03")}</h2>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <dt class="text-muted-foreground">{t("cf04")}</dt><dd class="break-all font-mono">{props.commit.uncommitted ? "*" : props.commit.hash}</dd>
            <dt class="text-muted-foreground">{props.stash ? t("mode05") : t("cf05")}</dt><dd class="break-words">{props.commit.author}</dd>
            <dt class="text-muted-foreground">{t("cf06")}</dt><dd><Show when={props.commit.date} fallback="—"><time dateTime={props.commit.date}>{new Date(props.commit.date).toLocaleString(locale())}</time></Show></dd>
          </dl>
          <p class="cursor-text select-text whitespace-pre-wrap break-words text-sm">{message()}</p>
          <Show when={props.commit.parents.length > 1}><p class="text-xs text-muted-foreground">{t("cf07")}</p></Show>
          <Separator />
          <h3 class="text-sm font-medium">{t("cf08", { count: files().length })}</h3>
          <Show when={loading()}><p role="status" class="text-sm text-muted-foreground">{t("cf09")}</p></Show>
          <Show when={!loading() && !files().length && !error()}><p class="text-sm text-muted-foreground">{t("cf10")}</p></Show>
          <ChangedFilesTree files={files()} selectedPath={selectedFile()} disabled={props.disabled} onSelect={file => void openFile(file)} />
        </section>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t("cf11")} />
      <ResizablePanel minSize={0.25} class="min-h-0 min-w-0 overflow-hidden">
        <div class="flex h-full min-h-0 flex-col p-4" aria-label={t("cf12")}>
          <Show when={opening()}><p role="status" class="text-sm text-muted-foreground">{t("cf13")}</p></Show>
          <Show when={diff()}>{data => <FileDiffView diff={data()} />}</Show>
          <Show when={!selectedFile()}><p class="text-sm text-muted-foreground">{t("cf14")}</p></Show>
        </div>
      </ResizablePanel>
    </Resizable>
  );
}
