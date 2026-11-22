import { readFilePresentation, saveFilePresentation } from "~/lib/file-presentation";
import { PanelHeader } from "~/components/ui/panel-header";
import DirectoryDiffView from "./directory-diff-view";
import { filesInDirectory } from "~/lib/file-tree";
import { locale, t } from "~/lib/i18n";
import { Show, createEffect, createSignal, onCleanup, on, createMemo } from "solid-js";
import { git, type Commit, type CommitFile, type FileDiff } from "~/lib/git";
import { Resizable, ResizablePanel, ResizableHandle } from "~/components/ui/resizable";
import FileDiffView from "~/components/sections/file-diff-view";

import ChangedFilesBrowser from "./changed-files-browser";

export default function CommitFiles(props: { commit: Commit; stash?: boolean; disabled: boolean }) {
  const [presentation, setPresentation] = createSignal(readFilePresentation());
  const [message, setMessage] = createSignal("");
  const [files, setFiles] = createSignal<CommitFile[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [opening, setOpening] = createSignal(false);
  const [selectedDirectory, setSelectedDirectory] = createSignal("");
  const directoryFiles = createMemo(() => filesInDirectory(files(), selectedDirectory()));
  const [selectedFile, setSelectedFile] = createSignal("");
  const [diff, setDiff] = createSignal<FileDiff>();
  const [expanded, setExpanded] = createSignal(false);
  let diffRequest = 0;
  let generation = 0;
  createEffect(on(createMemo(() => `${props.commit.hash}:${Boolean(props.stash)}`), () => {
    setExpanded(false);
    const hash = props.commit.hash;
    const request = ++generation;
    diffRequest++; setDiff(undefined); setOpening(false);
    setSelectedDirectory(""); setMessage(props.commit.subject); setFiles([]); setSelectedFile(""); setLoading(true); setError("");
    void (props.stash ? git.getStashDetails(hash) : git.getCommitDetails(hash))
      .then(result => { if (request === generation) { setFiles(result.files); setMessage(result.message); } })
      .catch(e => { if (request === generation) setError(String(e)); })
      .finally(() => { if (request === generation) setLoading(false); });
  }));
  onCleanup(() => { generation++; diffRequest++; });
  async function openFile(file: CommitFile) {
    if (props.disabled) return;
    const request = ++diffRequest;
    setSelectedDirectory(""); setOpening(true); setDiff(undefined); setSelectedFile(file.path);
    try {
      const result = await (props.stash ? git.getStashDiff(props.commit.hash, file.path) : git.getFileDiff(props.commit.hash, file.path));
      if (request === diffRequest) setDiff(result);
    } catch { /* The Git API reports failures in the terminal. */ }
    finally { if (request === diffRequest) setOpening(false); }
  }
  return (
    <Resizable layoutId={props.stash ? "stash.details" : "history.details"} orientation="horizontal" initialSizes={[0.5, 0.5]} class="min-h-0 min-w-0">
      <ResizablePanel minSize={0.2} class="min-h-0 min-w-0 overflow-hidden">
        <div class="panel-surface flex h-full min-h-0 flex-col">
          <section class="shrink-0 border-b" aria-label={t("details.title")}>
            <PanelHeader class="px-4"><h2>{props.stash ? t("stash.entry") : t("details.selected")}</h2></PanelHeader>
            <div class="space-y-2 px-4 py-2">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span class="select-text font-mono" aria-label={t("details.hash")} title={props.commit.hash}>{props.commit.hash.slice(0, 8)}</span>
                <span class="min-w-0 truncate" aria-label={props.stash ? t("stash.reference") : t("details.author")} title={props.commit.author}>{props.commit.author}</span>
                <Show when={props.commit.date}><time aria-label={t("details.date")} dateTime={props.commit.date} title={new Date(props.commit.date).toLocaleString(locale())}>{new Date(props.commit.date).toLocaleDateString(locale())}</time></Show>
              </div>
              <p class="truncate text-sm font-medium" title={message().split("\n")[0]}>{message().split("\n")[0]}</p>
              <Show when={Boolean(message()) || props.commit.parents.length > 1}>
                <button type="button" class="text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring" aria-expanded={expanded()} onClick={() => setExpanded(value => !value)}>{expanded() ? t("details.hide-message") : t("details.show-message")}</button>
              </Show>
              <Show when={expanded()}><div class="max-h-32 overflow-auto text-sm">
                <p class="mb-2 select-text break-all font-mono text-xs text-muted-foreground">{props.commit.hash}</p>
                <p tabindex={0} aria-label={t("commit.message")} class="select-text whitespace-pre-wrap break-words">{message()}</p>
                <Show when={props.commit.parents.length > 1}><p class="mt-2 text-xs text-muted-foreground">{t("details.first-parent")}</p></Show>
              </div></Show>
            </div>
          </section>
          <ChangedFilesBrowser presentation={presentation()} onPresentationChange={value => { setPresentation(value); saveFilePresentation(value); }}
            loading={loading()} error={error()} commit={props.commit.hash} files={files()} selectedPath={selectedDirectory() || selectedFile()} disabled={props.disabled} onSelect={file => void openFile(file)}
            onSelectDirectory={path => { if (!props.disabled) { diffRequest++; setOpening(false); setDiff(undefined); setSelectedFile(""); setSelectedDirectory(path); } }} />

        </div>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t("details.resize")} />
      <ResizablePanel minSize={0.25} class="min-h-0 min-w-0 overflow-hidden">
        <div class="flex h-full min-h-0 flex-col px-4 pb-4" aria-label={t("details.diff")}>
          <Show when={selectedDirectory()} fallback={<>
          <Show when={opening()}><p role="status" class="pt-4 text-sm text-muted-foreground">{t("details.loading-diff")}</p></Show>
          <Show when={diff()}>{data => <FileDiffView diff={data()} />}</Show>
          <Show when={!selectedFile()}><p class="flex min-h-[var(--panel-header-height)] shrink-0 items-center text-xs text-muted-foreground">{t("details.select-file")}</p></Show>
          </>}>
            <DirectoryDiffView path={selectedDirectory()} files={directoryFiles()} commit={props.commit.hash} stash={props.stash} />
          </Show>
        </div>
      </ResizablePanel>
    </Resizable>
  );
}
