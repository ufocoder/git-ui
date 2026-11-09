import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { For, Show, createSignal, onCleanup } from "solid-js";
import { language, locale, t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import { git, type History, type PullMode, type RepositoryMode, type SyncAction } from "~/lib/git";

type RepositoryToolbarProps = {
  onStashActionsMount: (element: HTMLDivElement) => void;
  mode: RepositoryMode;
  onStashAll: () => void;
  busy: boolean;
  history: History | undefined;
  action: SyncAction | null;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onConfigureUpstream: () => void;
  onSync: (action: SyncAction, pullMode?: PullMode) => void;
};
function RemoteIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 5h6v6m0-6-9 9m7-1v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
  </svg>;
}
function SyncIcon(props: { active: boolean; direction: "up" | "down" }) {
  return <svg aria-hidden="true" class="size-3.5 shrink-0" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d={props.active ? "M6 3h12M6 21h12M7 3v4l5 5-5 5v4m10-18v4l-5 5 5 5v4" : props.direction === "down" ? "M12 4v16m-6-6 6 6 6-6" : "M12 20V4m-6 6 6-6 6 6"} />
  </svg>;
}

export default function RepositoryToolbar(props: RepositoryToolbarProps) {
  const platform = () => navigator.platform.toLowerCase();
  const revealLabel = () => platform().startsWith("mac") ? t("file-action.finder") : platform().startsWith("win") ? t("file-action.explorer") : t("file-action.reveal");
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(clock));
  const fetchAge = () => {
    const time = props.history?.last_fetch;
    if (!time) return t("fetch.unknown");
    const minutes = Math.max(0, Math.floor((now() - time) / 60_000));
    if (minutes < 1) return t("fetch.now");
    const format = new Intl.RelativeTimeFormat(language() === "ru" ? "ru" : "en", { numeric: "auto" });
    const age = minutes < 60 ? format.format(-minutes, "minute") : minutes < 1440 ? format.format(-Math.floor(minutes / 60), "hour") : format.format(-Math.floor(minutes / 1440), "day");
    return t("fetch.age", { age });
  };
  const pullBlocked = () => {
    if (props.busy) return t("history.busy");
    if (props.history?.git_lfs_missing) return t("setup.lfs-warning");
    if (!props.history?.current_branch) return t("sidebar.detached");
    if (props.history.operation) return t("stash.operation-in-progress");
    if (!props.history.sync.upstream) return t(props.history.remotes.length ? "sync.no-upstream" : "error.remote-required");
    return undefined;
  };
  return (
        <nav aria-label={t("toolbar.navigation")} class="flex shrink-0 flex-wrap items-center justify-start gap-2 border-b px-4 py-2 min-h-16">
          <Show when={props.mode === "history"} fallback={<Show when={props.mode !== "commit"}><h1 class="text-sm font-medium">{props.mode === "conflicts" ? t("conflict.title") : t("stash.title")}</h1></Show>}>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="ghost" class="h-control-toolbar px-control-sm-x" disabled={props.busy || !props.history?.remotes.length}
              onClick={() => void props.onSync("fetch")} title={`${t("sync.fetch-description")}\n${fetchAge()}\n${props.history?.last_fetch ? t("fetch.last", { date: new Date(props.history.last_fetch).toLocaleString(locale()) }) : t("fetch.refresh-hint")}`}>{props.action === "fetch" ? t("sync.fetching") : t("sync.fetch")}</Button>
            <div class="flex items-center">
              <span title={pullBlocked() ?? t("pull.description")}>
                <Button variant="ghost" class="h-control-toolbar gap-1.5 pl-2 pr-2" disabled={Boolean(pullBlocked())} aria-busy={props.action === "pull"}
                  aria-label={props.action === "pull" ? t("pull.running") : undefined}
                  onClick={() => props.onSync("pull")}><SyncIcon active={props.action === "pull"} direction="down" />{t("pull.action")}</Button>
              </span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="h-7 w-6 shrink-0" disabled={props.busy} aria-label={t("pull.options")} title={t("pull.options")}>
                  <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 9 6 6 6-6" /></svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "fast-forward-only")}>{t("pull.ff-only")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "rebase")}>{t("pull.rebase")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "merge")}>{t("pull.merge")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!props.history?.current_branch || !props.history.tip || !props.history.remotes.length || Boolean(props.history.operation)} onSelect={props.onConfigureUpstream}>{props.history?.sync.upstream ? t("upstream.change") : t("upstream.set")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div class="flex min-w-0 items-center">
              <Button variant="ghost" class="h-control-toolbar gap-1.5 pl-2 pr-2" disabled={props.busy || props.history?.git_lfs_missing || !props.history?.current_branch || !props.history?.tip}
                aria-busy={props.action === "push"} aria-label={props.action === "push" ? t("push.running") : undefined}
                onClick={() => void props.onSync("push")} title={props.history?.sync.upstream ? `${t("push.description")}\n${t("sync.comparison", { branch: props.history.sync.upstream })}${!props.history.sync.ahead && !props.history.sync.behind ? `\n${t("sync.up-to-date")}` : ""}` : t("push.description")}>
                <SyncIcon active={props.action === "push"} direction="up" />
                {props.history?.sync.upstream ? t("push.action") : t("toolbar.publish")}
                <Show when={props.history?.sync.upstream}><span class="max-w-40 truncate text-muted-foreground">{props.history?.sync.upstream}</span></Show>
              </Button>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="h-7 w-6 shrink-0" disabled={props.busy || !props.history?.current_branch || !props.history.tip} aria-label={t("toolbar.push-settings")}>
                  <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 9 6 6 6-6" /></svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={props.busy || !props.history?.remotes.length} onSelect={props.onConfigureUpstream} title={!props.history?.sync.upstream ? t("sync.no-upstream") : undefined}>{props.history?.sync.upstream ? t("upstream.change") : t("upstream.set")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          </Show>
          <Show when={props.mode === "stash"}><div ref={props.onStashActionsMount} class="flex items-center gap-2" /></Show>
          <Show when={props.mode === "commit"}><Button variant="outline" class="h-control-toolbar px-control-sm-x" disabled={props.busy || !props.history?.has_changes || !props.history.tip || Boolean(props.history.operation)} onClick={props.onStashAll} title={props.busy ? t("history.busy") : !props.history?.tip ? t("stash.first-commit") : props.history.operation ? t("stash.operation-in-progress") : !props.history.has_changes ? t("stash.clean") : t("stash.all-description")}>{t("stash.all")}</Button></Show>
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <Button variant={props.terminalOpen ? "secondary" : "ghost"} class="h-control-toolbar px-control-sm-x" aria-pressed={props.terminalOpen} aria-controls="repository-terminal" onClick={props.onToggleTerminal}>
              <span aria-hidden="true" class="font-mono">{t("terminal.icon")}</span> {t("terminal.title")}</Button>
            <Button variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.busy || !props.history}
              aria-label={revealLabel()} title={revealLabel()} onClick={() => void git.revealPath().catch(() => {})}>
              <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              </svg>
            </Button>
            <Show when={(props.history?.remotes.length ?? 0) > 1} fallback={
              <Button variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.busy || !props.history?.remotes.length}
                aria-label={t("project.view-remote")} title={t("project.view-remote")} onClick={() => {
                  const remote = props.history?.remotes[0];
                  if (remote) void git.openProjectRemote(remote.name).catch(() => {});
                }}><RemoteIcon /></Button>
            }>
              <DropdownMenu placement="bottom-end">
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.busy}
                  aria-label={t("project.view-remote")} title={t("project.view-remote")}><RemoteIcon /></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <For each={props.history?.remotes}>{remote =>
                    <DropdownMenuItem onSelect={() => void git.openProjectRemote(remote.name).catch(() => {})}>
                      {t("project.view-named-remote", { remote: remote.name })}
                    </DropdownMenuItem>
                  }</For>
                </DropdownMenuContent>
              </DropdownMenu>
            </Show>
          </div>
        </nav>
  );
}
