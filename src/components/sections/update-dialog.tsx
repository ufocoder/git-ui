import { Progress } from "~/components/ui/progress";
import { downloadPercent } from "~/lib/update-progress";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import gitForkIcon from "~/assets/logo.svg";
import { t } from "~/lib/i18n";
import { updates, type UpdateInfo, type UpdateProgress } from "~/lib/updates";
import { Button } from "~/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";

export default function UpdateDialog(props: { onClose: () => void; onInstallingChange: (installing: boolean) => void }) {
  const [repository, setRepository] = createSignal("");
  const [currentVersion, setCurrentVersion] = createSignal("");
  const [info, setInfo] = createSignal<UpdateInfo>();
  const [checking, setChecking] = createSignal(false);
  const [installing, setInstalling] = createSignal(false);
  const [progress, setProgress] = createSignal<UpdateProgress>();
  const [error, setError] = createSignal("");
  const busy = () => checking() || installing();
  const percent = createMemo(() => downloadPercent(progress()));
  let active = true;
  onCleanup(() => { active = false; });
  async function check() {
    if (busy() || !repository().trim()) return;
    setChecking(true); setError(""); setInfo(undefined); setProgress(undefined);
    try {
      const result = await updates.check(repository().trim());
      if (active) { setInfo(result); setCurrentVersion(result.currentVersion); }
    } catch (failure) { if (active) setError(String(failure)); }
    finally { if (active) setChecking(false); }
  }
  onMount(async () => {
    try {
      const settings = await updates.settings();
      if (!active) return;
      setRepository(settings.repository); setCurrentVersion(settings.currentVersion);
      await check();
    } catch (failure) { if (active) setError(String(failure)); }
  });
  async function install() {
    if (busy() || !info()?.installable) return;
    setInstalling(true); props.onInstallingChange(true); setError(""); setProgress({ phase: "downloading", downloaded: 0, total: null });
    try { await updates.install(status => { if (active) setProgress(status); }); }
    catch (failure) { if (active) { setError(String(failure)); setProgress(undefined); } }
    finally { if (active) { setInstalling(false); props.onInstallingChange(false); } }
  }
  async function showRelease(url: string) {
    try { await openUrl(url); }
    catch (failure) { if (active) setError(String(failure)); }
  }
  return <section class="flex min-h-80 flex-col gap-4 p-6">
    <header class="flex items-center gap-3">
      <img src={gitForkIcon} width="48" height="48" class="size-12 shrink-0" alt="" />
      <div>
        <h1 class="text-xl font-semibold">{t("update.title")}</h1>
        <Show when={currentVersion()}><p class="mt-1 text-sm text-muted-foreground">{t("update.current", { version: currentVersion() })}</p></Show>
      </div>
    </header>
    <section class="space-y-3" aria-live="polite" aria-busy={busy()}>
      <Show when={checking()}><p class="text-sm text-muted-foreground">{t("update.checking")}</p></Show>
      <Show when={info()}>{result => <>
        <Badge variant={result().available ? "default" : "secondary"}>
          {result().available ? t("update.available", { version: result().version ?? "" }) : result().notice || t("update.up-to-date")}
        </Badge>
        <Show when={result().available && result().notice}><p class="text-sm leading-relaxed text-muted-foreground">{result().notice}</p></Show>

      </>}</Show>
      <Show when={installing()}>
        <p class="text-sm" role="status">{progress()?.phase === "restarting" ? t("update.restarting") : progress()?.phase === "installing" ? t("update.installing") : t("update.downloading")}</p>
        <Progress value={percent()} label={t("update.downloading")} />
        <Show when={progress()?.phase === "downloading"}><p class="text-xs text-muted-foreground">{percent() !== undefined ? `${percent()}%` : t("update.downloaded", { size: ((progress()?.downloaded ?? 0) / 1048576).toFixed(1) })}</p></Show>
      </Show>
      <Show when={error()}><Alert variant="destructive"><AlertTitle>{t("update.error")}</AlertTitle><AlertDescription class="break-words">{error()}</AlertDescription></Alert></Show>
    </section>
    <footer class="mt-auto space-y-3">
      <Show when={info()?.installable}><p class="text-sm text-muted-foreground">{t("update.restart-note")}</p></Show>
      <div class="flex items-center justify-end gap-3">
        <Button variant="outline" disabled={installing()} onClick={props.onClose}>{t("update.close")}</Button>
        <Show when={info()?.available}>
          <Button disabled={busy()} onClick={() => {
            if (info()?.installable) void install();
            else { const url = info()?.releaseUrl; if (url) void showRelease(url); }
          }}>{info()?.installable ? t("update.install") : t("update.download")}</Button>
        </Show>
      </div>
    </footer>
  </section>;
}
