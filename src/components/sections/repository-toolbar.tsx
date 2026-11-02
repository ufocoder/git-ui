import { Show, createSignal, onCleanup } from "solid-js";
import { language, locale, t } from "~/lib/i18n";
import { Button } from "~/components/ui/button";
import type { History, RepositoryMode, SyncAction } from "~/lib/git";

type RepositoryToolbarProps = {
  mode: RepositoryMode;
  onStashAll: () => void;
  busy: boolean;
  history: History | undefined;
  action: SyncAction | null;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onConfigureUpstream: () => void;
  onSync: (action: SyncAction) => void;
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
  return (
        <nav aria-label={t("nav01")} class="flex shrink-0 flex-wrap items-center justify-start gap-3 border-b px-4 py-2">
          <Show when={props.mode === "history"} fallback={<Show when={props.mode !== "commit"}><h1 class="text-sm font-medium">{props.mode === "conflicts" ? t("conf01") : t("stash01")}</h1></Show>}>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="ghost" class="h-8 px-3" disabled={props.busy || !props.history?.remotes.length}
              onClick={() => void props.onSync("fetch")} title={t("sync02")}>{props.action === "fetch" ? t("sync03") : t("sync01")}</Button>
            <Button variant="ghost" class="h-8 px-3" disabled={props.busy || !props.history?.current_branch || !props.history?.sync.upstream || !props.history?.remotes.length}
              onClick={() => void props.onSync("pull")} title={t("nav02")}>{props.action === "pull" ? t("nav03") : t("nav04")}</Button>
            <Button variant="ghost" class="h-8 px-3" disabled={props.busy || !props.history?.current_branch || !props.history?.tip}
              onClick={() => void props.onSync("push")} title={t("nav05")}>{props.action === "push" ? t("nav06") : t("nav07")}</Button>

          </div>
          <Show when={props.history?.remotes.length}>
            <span class="text-xs text-muted-foreground" title={props.history?.last_fetch ? t("fetch04", { date: new Date(props.history.last_fetch).toLocaleString(locale()) }) : t("fetch05")}>
              {fetchAge()}
            </span>
          </Show>
          <Show when={props.history?.current_branch}>
            <Button size="sm" variant="ghost" disabled={props.busy || !props.history?.tip || !props.history?.remotes.length} onClick={props.onConfigureUpstream}
              title={props.history?.sync.upstream ? t("track03") : t("sync08")} aria-label={props.history?.sync.upstream ? t("track03") : t("track02")}>
              <span class="max-w-36 truncate">{props.history?.sync.upstream ?? t("track02")}</span>
            </Button>
          </Show>
          <Show when={props.history?.sync.upstream}>
            <div class="flex flex-wrap items-center gap-1" title={t("sync12", { branch: props.history?.sync.upstream ?? "" })}>
              <Show when={!props.history?.sync.ahead && !props.history?.sync.behind}><span class="text-xs text-muted-foreground">{t("sync07")}</span></Show>
            </div>
          </Show>
          </Show>
          <Show when={props.mode === "commit"}><Button variant="ghost" class="h-8 px-3" disabled={props.busy || !props.history?.has_changes || !props.history.tip || Boolean(props.history.operation)} onClick={props.onStashAll} title={props.busy ? t("hist01") : !props.history?.tip ? t("stash13") : props.history.operation ? t("stash12") : !props.history.has_changes ? t("stash14") : t("stash25")}>{t("stash24")}</Button></Show>
          <Button variant={props.terminalOpen ? "secondary" : "ghost"} class="ml-auto h-8 px-3" aria-pressed={props.terminalOpen} aria-controls="repository-terminal" onClick={props.onToggleTerminal}>
            <span aria-hidden="true" class="font-mono">{t("nav10")}</span> {t("nav11")}</Button>
        </nav>
  );
}
