import { Show } from "solid-js";
import { t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import type { History, HistoryScope, RepositoryMode, SyncAction } from "~/lib/git";

type RepositoryToolbarProps = {
  mode: RepositoryMode;
  onRefresh: () => void;
  onStashAll: () => void;
  scope: HistoryScope;
  onScopeChange: (scope: HistoryScope) => void;
  busy: boolean;
  history: History | undefined;
  action: SyncAction | null;
  status: string;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onConfigureUpstream: () => void;
  onSync: (action: SyncAction) => void;
};
export default function RepositoryToolbar(props: RepositoryToolbarProps) {
  return (
        <nav aria-label={t("nav01")} class="flex shrink-0 flex-wrap items-center justify-start gap-3 border-b px-4 py-2">
          <Show when={props.mode === "history"} fallback={<div class="flex items-center gap-3"><h1 class="text-sm font-semibold">{props.mode === "commit" ? t("mode02") : props.mode === "conflicts" ? t("conf01") : t("stash01")}</h1><Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRefresh}>{t("op28")}</Button></div>}>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={props.busy || !props.history?.remotes.length}
              onClick={() => void props.onSync("fetch")} title={t("sync02")}>{props.action === "fetch" ? t("sync03") : t("sync01")}</Button>
            <Button variant="outline" disabled={props.busy || !props.history?.current_branch || !props.history?.sync.upstream || !props.history?.remotes.length}
              onClick={() => void props.onSync("pull")} title={t("nav02")}>{props.action === "pull" ? t("nav03") : t("nav04")}</Button>
            <Button variant="outline" disabled={props.busy || !props.history?.current_branch || !props.history?.tip}
              onClick={() => void props.onSync("push")} title={t("nav05")}>{props.action === "push" ? t("nav06") : t("nav07")}</Button>
            <span role="status" class="text-xs text-muted-foreground">{props.status}</span>

          </div>
          <Show when={props.history?.current_branch}>
            <Button size="sm" variant="ghost" disabled={props.busy || !props.history?.tip || !props.history?.remotes.length} onClick={props.onConfigureUpstream}
              title={props.history?.sync.upstream ? t("track03") : t("sync08")} aria-label={props.history?.sync.upstream ? t("track03") : t("track02")}>
              <span class="max-w-36 truncate">{props.history?.sync.upstream ?? t("track02")}</span>
            </Button>
          </Show>
          <Show when={props.history?.sync.upstream}>
            <div class="flex flex-wrap items-center gap-1" title={t("sync12", { branch: props.history?.sync.upstream ?? "" })}>
              <Show when={props.scope !== "all"}><Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onScopeChange("all")}>{t("sync06")}</Button></Show>
              <Show when={(props.history?.sync.behind ?? 0) > 0 || props.scope === "incoming"}>
                <Button size="sm" variant={props.scope === "incoming" ? "secondary" : "ghost"} aria-pressed={props.scope === "incoming"} disabled={props.busy} onClick={() => props.onScopeChange(props.scope === "incoming" ? "all" : "incoming")}>
                  <span aria-hidden="true">↓</span>{t("sync04")}<Show when={props.history?.sync.behind}>{count => <span class="font-mono tabular-nums">{count()}</span>}</Show>
                </Button>
              </Show>
              <Show when={(props.history?.sync.ahead ?? 0) > 0 || props.scope === "outgoing"}>
                <Button size="sm" variant={props.scope === "outgoing" ? "secondary" : "ghost"} aria-pressed={props.scope === "outgoing"} disabled={props.busy} onClick={() => props.onScopeChange(props.scope === "outgoing" ? "all" : "outgoing")}>
                  <span aria-hidden="true">↑</span>{t("sync05")}<Show when={props.history?.sync.ahead}>{count => <span class="font-mono tabular-nums">{count()}</span>}</Show>
                </Button>
              </Show>
              <Show when={!props.history?.sync.ahead && !props.history?.sync.behind}><span class="text-xs text-muted-foreground">{t("sync07")}</span></Show>
            </div>
          </Show>
          </Show>
          <Show when={props.mode === "commit"}><Button variant="outline" disabled={props.busy || !props.history?.has_changes || !props.history.tip || Boolean(props.history.operation)} onClick={props.onStashAll} title={props.busy ? t("hist01") : !props.history?.tip ? t("stash13") : props.history.operation ? t("stash12") : !props.history.has_changes ? t("stash14") : t("stash25")}>{t("stash24")}</Button></Show>
          <Button variant={props.terminalOpen ? "secondary" : "outline"} class="ml-auto" aria-pressed={props.terminalOpen} aria-controls="repository-terminal" onClick={props.onToggleTerminal}>
            <span aria-hidden="true" class="font-mono">{t("nav10")}</span> {t("nav11")}</Button>
        </nav>
  );
}
