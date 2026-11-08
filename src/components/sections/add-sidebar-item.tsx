import { t } from "~/lib/i18n";
import { Show, createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { TextField, TextFieldLabel, TextFieldInput } from "~/components/ui/text-field";

export default function AddSidebarItem(props: { kind: "tag" | "remote"; disabled: boolean; onCreate: (name: string, url: string) => Promise<void> }) {
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const title = () => props.kind === "tag" ? t("tag.create") : t("remote.add");
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || !name().trim()) return;
    setPending(true);
    try { await props.onCreate(name().trim(), url().trim()); setOpen(false); }
    catch { setOpen(false); }
    finally { setPending(false); }
  }
  return <Dialog open={open()} onOpenChange={value => {
    if (pending()) return;
    if (value) { setName(""); setUrl(""); }
    setOpen(value);
  }}>
    <DialogTrigger as={Button} variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.disabled} aria-label={title()} title={title()}>+</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title()}</DialogTitle>
        <DialogDescription>{props.kind === "tag" ? t("tag.create-head") : t("remote.add-description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} class="space-y-4">
        <TextField value={name()} onChange={setName} disabled={pending()} required>
          <TextFieldLabel>{props.kind === "tag" ? t("tag.name") : t("remote.name")}</TextFieldLabel>
          <TextFieldInput placeholder={props.kind === "tag" ? t("tag.example") : t("remote.example")} autocomplete="off" spellcheck={false} />
        </TextField>
        <Show when={props.kind === "remote"}>
          <TextField value={url()} onChange={setUrl} disabled={pending()} required>
            <TextFieldLabel>{t("remote.url")}</TextFieldLabel>
            <TextFieldInput placeholder={t("remote.url-example")} autocomplete="off" spellcheck={false} />
          </TextField>
        </Show>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" disabled={pending()} onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={pending() || !name().trim() || (props.kind === "remote" && !url().trim())}>{pending() ? t("common.saving") : props.kind === "tag" ? t("common.create") : t("common.add")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
