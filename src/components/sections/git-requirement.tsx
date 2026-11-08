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
    <Show when={props.state !== "checking"} fallback={<p class="text-muted-foreground" role="status">{t("setup.checking")}</p>}>
      <h2 class="text-lg font-semibold">{props.state === "missing" ? t("setup.missing") : t("setup.check-error")}</h2>
      <p class="text-muted-foreground">{t("setup.required")}</p>
      <Show when={props.platform === "windows"}><p class="text-muted-foreground">{t("setup.windows")}</p></Show>
      <Show when={props.platform === "macos"}>
        <p class="text-muted-foreground">{t("setup.macos")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">xcode-select --install</code>
      </Show>
      <Show when={props.platform === "linux"}>
        <p class="text-muted-foreground">{t("setup.debian")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">sudo apt install git</code>
        <p class="text-muted-foreground">{t("setup.fedora")}</p>
        <code class="block select-text rounded-md border bg-muted px-3 py-2">sudo dnf install git</code>
      </Show>
      <a href={url()} target="_blank" rel="noreferrer" class="inline-block font-medium underline underline-offset-4" onClick={event => {
        if (!isTauri()) return;
        event.preventDefault(); setLinkError(false);
        void openUrl(url()).catch(() => setLinkError(true));
      }}>{t("setup.download")}</a>
      <Show when={linkError()}><p role="alert" class="text-destructive">{t("setup.link-error")} <span class="select-text">{url()}</span></p></Show>
      <p class="text-muted-foreground">{t("setup.restart-note")}</p>
      <Button variant="outline" onClick={props.onRetry}>{t("setup.retry")}</Button>
    </Show>
  </div>;
}
