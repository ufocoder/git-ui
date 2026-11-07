import { SelectField } from "~/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Show, createSignal, onCleanup } from "solid-js";
import { language, locale, t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import type { History, PullMode, RepositoryMode, SyncAction } from "~/lib/git";

type RepositoryToolbarProps = {
  onStashActionsMount: (element: HTMLDivElement) => void;
  mode: RepositoryMode;
  historyBranch: string;
  onHistoryBranchChange: (value: string) => void;
  onStashAll: () => void;
  busy: boolean;
  history: History | undefined;
  action: SyncAction | null;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onConfigureUpstream: () => void;
  onSync: (action: SyncAction, pullMode?: PullMode) => void;
};
export default function RepositoryToolbar(props: RepositoryToolbarProps) {
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(clock));
  const fetchAge = () => {
    const time = props.history?.last_fetch;
    if (!time) return t("fetch01");
    const minutes = Math.max(0, Math.floor((now() - time) / 60_000));
    if (minutes < 1) return t("fetch02");
    const format = new Intl.RelativeTimeFormat(language() === "ru" ? "ru" : "en", { numeric: "auto" });
    const age = minutes < 60 ? format.format(-minutes, "minute") : minutes < 1440 ? format.format(-Math.floor(minutes / 60), "hour") : format.format(-Math.floor(minutes / 1440), "day");
    return t("fetch03", { age });
  };
  const pullBlocked = () => {
    if (props.busy) return t("hist01");
    if (!props.history?.current_branch) return t("repo04");
    if (props.history.operation) return t("stash12");
    if (!props.history.sync.upstream) return t(props.history.remotes.length ? "sync08" : "err45");
    return undefined;
  };
  return (
        <nav aria-label={t("nav01")} class="flex shrink-0 flex-wrap items-center justify-start gap-2 border-b px-4 py-2 min-h-12">
          <Show when={props.mode === "history"} fallback={<Show when={props.mode !== "commit"}><h1 class="text-sm font-medium">{props.mode === "conflicts" ? t("conf01") : t("stash01")}</h1></Show>}>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="ghost" class="h-control-toolbar px-control-sm-x" disabled={props.busy || !props.history?.remotes.length}
              onClick={() => void props.onSync("fetch")} title={`${t("sync02")}\n${fetchAge()}\n${props.history?.last_fetch ? t("fetch04", { date: new Date(props.history.last_fetch).toLocaleString(locale()) }) : t("fetch05")}`}>{props.action === "fetch" ? t("sync03") : t("sync01")}</Button>
            <div class="flex items-center">
              <span title={pullBlocked() ?? t("nav02")}>
                <Button variant="ghost" class="h-control-toolbar px-control-sm-x" disabled={Boolean(pullBlocked())}
                  onClick={() => props.onSync("pull")}>{props.action === "pull" ? t("nav03") : t("nav04")}</Button>
              </span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.busy} aria-label={t("pull01")} title={t("pull01")}>
                  <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 9 6 6 6-6" /></svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "fast-forward-only")}>{t("pull02")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "rebase")}>{t("pull03")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={Boolean(pullBlocked())} onSelect={() => props.onSync("pull", "merge")}>{t("pull04")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!props.history?.current_branch || !props.history.tip || !props.history.remotes.length || Boolean(props.history.operation)} onSelect={props.onConfigureUpstream}>{props.history?.sync.upstream ? t("track03") : t("track02")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div class="flex min-w-0 items-center">
              <Button variant="ghost" class="h-control-toolbar gap-2 px-control-sm-x" disabled={props.busy || !props.history?.current_branch || !props.history?.tip}
                onClick={() => void props.onSync("push")} title={props.history?.sync.upstream ? `${t("nav05")}\n${t("sync12", { branch: props.history.sync.upstream })}${!props.history.sync.ahead && !props.history.sync.behind ? `\n${t("sync07")}` : ""}` : t("nav05")}>
                {props.action === "push" ? t("nav06") : props.history?.sync.upstream ? t("nav07") : t("toolbar01")}
                <Show when={props.history?.sync.upstream}><span class="max-w-40 truncate text-muted-foreground">{props.history?.sync.upstream}</span></Show>
              </Button>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.busy || !props.history?.current_branch || !props.history.tip} aria-label={t("toolbar02")}>
                  <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 9 6 6 6-6" /></svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={props.busy || !props.history?.remotes.length} onSelect={props.onConfigureUpstream} title={!props.history?.sync.upstream ? t("sync08") : undefined}>{props.history?.sync.upstream ? t("track03") : t("track02")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <SelectField class="w-fit max-w-[min(10rem,100%)]" triggerClass="h-control-toolbar gap-1.5 border-transparent bg-transparent px-2 shadow-none hover:bg-accent" aria-label={t("historyView03")} value={props.historyBranch} onChange={props.onHistoryBranchChange} disabled={props.busy}
            options={[{ value: "all", label: t("historyView01") }, ...(props.history?.branches ?? []).map(branch => ({ value: `refs/heads/${branch}`, label: branch })), ...(props.history?.remotes ?? []).flatMap(remote => remote.branches.map(branch => ({ value: `refs/remotes/${remote.name}/${branch}`, label: `${remote.name}/${branch}` }))), ...(!props.history?.current_branch ? [{ value: "current", label: "HEAD" }] : [])]} />
          </Show>
          <Show when={props.mode === "stash"}><div ref={props.onStashActionsMount} class="flex items-center gap-2" /></Show>
          <Show when={props.mode === "commit"}><Button variant="outline" class="h-control-toolbar px-control-sm-x" disabled={props.busy || !props.history?.has_changes || !props.history.tip || Boolean(props.history.operation)} onClick={props.onStashAll} title={props.busy ? t("hist01") : !props.history?.tip ? t("stash13") : props.history.operation ? t("stash12") : !props.history.has_changes ? t("stash14") : t("stash25")}>{t("stash24")}</Button></Show>
          <Button variant={props.terminalOpen ? "secondary" : "ghost"} class="ml-auto h-control-toolbar px-control-sm-x" aria-pressed={props.terminalOpen} aria-controls="repository-terminal" onClick={props.onToggleTerminal}>
            <span aria-hidden="true" class="font-mono">{t("nav10")}</span> {t("nav11")}</Button>
        </nav>
  );
}
