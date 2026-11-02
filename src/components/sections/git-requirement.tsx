import { Show, createSignal } from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "~/components/ui/button";
import { t } from "~/lib/i18n";

export type GitCheckState = "checking" | "ready" | "missing" | "error";

export default function GitRequirement(props: { state: GitCheckState; platform: string; onRetry: () => void }) {
  const [linkError, setLinkError] = createSignal(false);
  const url = () => `https://git-scm.com/install/${({ windows: "windows", macos: "mac", linux: "linux" } as Record<string, string>)[props.platform] ?? ""}`;
  return <div class="mt-6 w-full max-w-lg space-y-4 text-sm" aria-live="polite" aria-busy={props.state === "checking"}>
    <Show when={props.state !== "checking"} fallback={<p class="text-muted-foreground" role="status">{t("setup01")}</p>}>
      <h2 class="text-lg font-semibold">{props.state === "missing" ? t("setup02") : t("setup03")}</h2>
      <p class="text-muted-foreground">{t("setup04")}</p>
      <Show when={props.platform === "windows"}><p class="text-muted-foreground">{t("setup05")}</p></Show>
      <Show when={props.platform === "macos"}>
        <p class="text-muted-foreground">{t("setup06")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">xcode-select --install</code>
      </Show>
      <Show when={props.platform === "linux"}>
        <p class="text-muted-foreground">{t("setup07")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">sudo apt install git</code>
        <p class="text-muted-foreground">{t("setup08")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">sudo dnf install git</code>
      </Show>
      <a href={url()} target="_blank" rel="noreferrer" class="inline-block font-medium underline underline-offset-4" onClick={event => {
        if (!isTauri()) return;
        event.preventDefault(); setLinkError(false);
        void openUrl(url()).catch(() => setLinkError(true));
      }}>{t("setup09")}</a>
      <Show when={linkError()}><p role="alert" class="text-destructive">{t("setup10")} <span class="select-text">{url()}</span></p></Show>
      <p class="text-muted-foreground">{t("setup11")}</p>
      <Button variant="outline" onClick={props.onRetry}>{t("setup12")}</Button>
    </Show>
  </div>;
}
