import { PanelHeader } from "~/components/ui/panel-header";
import { FilePathLabel } from "~/components/ui/file-path-label";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Button } from "~/components/ui/button";
import { git, type CommitFile, type FileDiff, type WorktreeDiffScope } from "~/lib/git";
import { t } from "~/lib/i18n";
import FileDiffView from "./file-diff-view";

type HunkActions = { canStageHunk?: (diff: FileDiff) => boolean; onStageHunk?: (diff: FileDiff, index: number) => void; stageDisabled?: boolean };

type Props = HunkActions & { path: string; files: CommitFile[]; commit: string; stash?: boolean; scope?: WorktreeDiffScope };

export default function DirectoryDiffView(props: Props) {
  let viewport!: HTMLDivElement;
  const [activePath, setActivePath] = createSignal("");
  const tabPath = () => props.files.some(file => file.path === activePath()) ? activePath() : props.files[0]?.path;
  function navigateFile(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute("data-directory-file")) return;
    const paths = props.files.map(file => file.path);
    const index = paths.indexOf(target.dataset.directoryFile ?? "");
    const next = Math.max(0, Math.min(paths.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    const item = [...viewport.querySelectorAll<HTMLElement>("[data-directory-file]")].find(element => element.dataset.directoryFile === paths[next]);
    if (item) { setActivePath(paths[next]); item.focus({ preventScroll: true }); item.scrollIntoView({ block: "start" }); }
  }
  createEffect(() => { void props.path; if (viewport) viewport.scrollTop = 0; });
  return <section class="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("directory.diff", { path: props.path })}>
    <PanelHeader class="-mx-4 px-4">
      <h3 class="flex min-w-0 flex-1"><FilePathLabel path={props.path} /></h3>
      <span class="shrink-0 text-muted-foreground">{t("details.files", { count: props.files.length })}</span>
    </PanelHeader>
    <div class="group/directory-files relative -mx-4 flex min-h-0 flex-1 flex-col">
    <div ref={value => { viewport = value; }} class="min-h-0 flex-1 divide-y overflow-auto" onKeyDown={navigateFile}>
      <For each={props.files.map(file => file.path)}>{path =>
        <DirectoryFileDiff tabIndex={path === tabPath() ? 0 : -1} onFocus={() => setActivePath(path)} path={path} commit={props.commit} stash={props.stash} scope={props.scope} revision={props.files} viewport={() => viewport}
          canStageHunk={props.canStageHunk} onStageHunk={props.onStageHunk} stageDisabled={props.stageDisabled} />
      }</For>
    </div>
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-30 hidden border border-ring group-focus-within/directory-files:block" />
    </div>
  </section>;
}

function DirectoryFileDiff(props: HunkActions & { tabIndex: number; onFocus: () => void; path: string; commit: string; stash?: boolean; scope?: WorktreeDiffScope; revision: CommitFile[]; viewport: () => HTMLElement }) {
  let element!: HTMLDivElement;
  let generation = 0;
  let identity = "";
  let loadedIdentity = "";
  let loadedRevision: CommitFile[] | undefined;
  const [visible, setVisible] = createSignal(false);
  const [diff, setDiff] = createSignal<FileDiff>();
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  onMount(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { root: props.viewport(), rootMargin: "600px 0px" });
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });
  onCleanup(() => { generation++; });
  createEffect(() => {
    const key = `${props.commit}:${props.stash}:${props.scope}:${props.path}`;
    void props.revision;
    const showing = visible();
    generation++;
    if (identity !== key) { identity = key; setDiff(undefined); setFailed(false); }
    if (showing && (loadedIdentity !== key || loadedRevision !== props.revision)) void load();
    else setLoading(false);
  });
  async function load() {
    const request = ++generation;
    const revision = props.revision, key = identity;
    setLoading(true); setFailed(false);
    try {
      const result = await (props.stash ? git.getStashDiff(props.commit, props.path) : git.getFileDiff(props.commit, props.path, props.scope));
      if (request === generation) { loadedIdentity = key; loadedRevision = revision; setDiff(result); }
    } catch { if (request === generation) setFailed(true); }
    finally { if (request === generation) setLoading(false); }
  }
  return <div ref={value => { element = value; }} class="min-w-0 px-4 pb-4 outline-none [&:focus-visible_.panel-header]:ring-2 [&:focus-visible_.panel-header]:ring-inset [&:focus-visible_.panel-header]:ring-ring" data-directory-file={props.path} tabindex={props.tabIndex} aria-label={props.path} onFocus={props.onFocus}
    onClick={event => { if (event.target instanceof Element && event.target.closest("header") && !event.target.closest("button, a, input")) event.currentTarget.focus({ preventScroll: true }); }} aria-busy={loading()}>
    <Show when={diff()} fallback={<div class="space-y-2 pt-4"><h3 class="flex min-w-0 flex-1"><FilePathLabel path={props.path} /></h3><Show when={!failed()}><p class="text-xs text-muted-foreground">{t("details.loading-diff")}</p></Show></div>}>{data =>
      <FileDiffView diff={data()} scope={props.scope} inline stageDisabled={props.stageDisabled || loading() || failed()}
        onStageHunk={props.canStageHunk?.(data()) && props.onStageHunk ? index => props.onStageHunk?.(data(), index) : undefined} />
    }</Show>
    <Show when={failed()}><p role="alert" class="mt-2 text-xs text-destructive">{t("directory.load-error")}</p><Button variant="link" size="sm" onClick={() => void load()}>{t("history.retry")}</Button></Show>
  </div>;
}
