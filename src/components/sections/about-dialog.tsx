import { Show, createSignal } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { t } from "~/lib/i18n";
import logo from "~/assets/logo.svg";
import { version } from "../../../package.json";

const website = "https://ufocoder.github.io/git-ui/";

export default function AboutDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [failed, setFailed] = createSignal(false);
  async function visit(event: MouseEvent) {
    if (!isTauri()) return;
    event.preventDefault();
    setFailed(false);
    try { await openUrl(website); } catch { setFailed(true); }
  }
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <Show when={props.open}><DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <img src={logo} alt="" class="mb-2 size-16" />
        <DialogTitle>{t("menu.about", { app: "git-ui" })}</DialogTitle>
        <DialogDescription>{t("update.current", { version })}</DialogDescription>
      </DialogHeader>
      <a class="break-all text-sm text-primary underline underline-offset-4" href={website} target="_blank" rel="noopener noreferrer" onClick={event => void visit(event)}>{website}</a>
      <Show when={failed()}><p role="alert" class="text-sm text-error-foreground">{t("setup.link-error")}</p></Show>
    </DialogContent></Show>
  </Dialog>;
}
