import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { For, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { t } from "~/lib/i18n";
import { git, type History } from "~/lib/git";
import { SidebarSection } from "~/components/ui/sidebar-section";
import { SidebarGroupContent, SidebarMenu, SidebarMenuItem } from "~/components/ui/sidebar";
import { SectionIcon } from "~/components/ui/repository-icons";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { SelectField } from "~/components/ui/select";
import { Checkbox } from "~/components/ui/checkbox";
import AddSidebarItem from "./add-sidebar-item";

export default function TagsSection(props: {
  history: History;
  disabled: boolean;
  onRename: (name: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (tag: string, remote: string | null) => Promise<void>;
  onPush: (remote: string, tag: string | null) => Promise<void>;
}) {
  const [selection, setSelection] = createSignal<{ tag: string | null; deleting?: boolean }>();
  const [deleteRemote, setDeleteRemote] = createSignal(false);
  const [remote, setRemote] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [remoteTag, setRemoteTag] = createSignal<"checking" | "present" | "absent" | "error">("absent");
  let checkRequest = 0;
  onCleanup(() => { checkRequest++; });
  createEffect(() => {
    const chosen = selection(), destination = remote();
    const request = ++checkRequest;
    setDeleteRemote(false);
    if (!chosen?.deleting || !chosen.tag || !destination) { setRemoteTag("absent"); return; }
    setRemoteTag("checking");
    void git.remoteTagExists(destination, chosen.tag).then(exists => {
      if (request === checkRequest) setRemoteTag(exists ? "present" : "absent");
    }).catch(() => { if (request === checkRequest) setRemoteTag("error"); });
  });
  function open(tag: string | null, deleting = false) {
    setRemote(props.history.remotes.find(entry => entry.name === "origin")?.name ?? props.history.remotes[0]?.name ?? "");
    setError(""); setDeleteRemote(false); setSelection({ tag, deleting });
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const chosen = selection();
    if (deleteRemote() && remoteTag() !== "present") return;
    if (!chosen || ((!chosen.deleting || deleteRemote()) && !remote()) || pending() || props.disabled) return;
    setPending(true); setError("");
    try {
      if (chosen.deleting && chosen.tag) await props.onDelete(chosen.tag, deleteRemote() ? remote() : null);
      else await props.onPush(remote(), chosen.tag);
      setSelection(undefined);
    }
    catch (reason) { setError(String(reason)); }
    finally { setPending(false); }
  }
  const disabled = () => props.disabled || pending();
  return <>
    <SidebarSection title={t("repo07")} icon={<SectionIcon name="tags" />} action={<div class="flex shrink-0 items-center">
      <DropdownMenu placement="bottom-end" gutter={4}>
        <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-7" disabled={disabled() || !props.history.tags.length} aria-label={t("refAct01", { name: t("repo07") })}>⋯</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem disabled={disabled() || !props.history.tags.length} onSelect={() => open(null)}>{t("tagPush02")}</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <AddSidebarItem kind="tag" disabled={disabled() || !props.history.tip} onCreate={name => props.onCreate(name)} />
    </div>}>
      <SidebarGroupContent><SidebarMenu>
        <For each={props.history.tags}>{tag => <SidebarMenuItem>
          <div class="group/tag flex h-8 min-w-0 items-center gap-1 px-2 py-1 text-sm leading-5">
            <span class="min-w-0 flex-1 truncate" title={tag}>{tag}</span>
            <DropdownMenu placement="bottom-end" gutter={4}>
              <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-6 shrink-0" disabled={disabled()} aria-label={t("refAct01", { name: tag })}>⋯</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem disabled={disabled()} onSelect={() => open(tag)}>{t("tagPush03", { tag })}</DropdownMenuItem>
                <DropdownMenuItem disabled={disabled()} onSelect={() => props.onRename(tag)}>{t("refAct02")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive data-[highlighted]:text-destructive" title={t("tagDel02", { tag })} disabled={disabled()} onSelect={() => open(tag, true)}>{t("tagDel01")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarMenuItem>}</For>
      </SidebarMenu><Show when={!props.history.tags.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo08")}</p></Show></SidebarGroupContent>
    </SidebarSection>
    <Dialog open={Boolean(selection())} onOpenChange={value => { if (!value && !disabled()) setSelection(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{selection()?.deleting ? t("tagDel01") : t("tagPush01")}</DialogTitle><DialogDescription>{selection()?.deleting ? t("tagDel03", { tag: selection()?.tag ?? "" }) : selection()?.tag === null ? t("tagPush04", { count: props.history.tags.length }) : t("tagPush03", { tag: selection()?.tag ?? "" })}</DialogDescription></DialogHeader>
        <form onSubmit={submit} class="space-y-4">
          <Show when={selection()?.deleting && props.history.remotes.length}>
            <label class="flex items-center gap-2 text-sm"><Checkbox checked={deleteRemote()} onChange={setDeleteRemote} disabled={disabled() || remoteTag() !== "present"} />{t("tagDel04")}</label>
          </Show>
          <Show when={!selection()?.deleting || props.history.remotes.length > 0}>
          <Show when={props.history.remotes.length} fallback={<p class="text-sm text-muted-foreground">{t("tagPush05")}</p>}>
            <SelectField label={t("track04")} value={remote()} onChange={setRemote} disabled={disabled()} options={props.history.remotes.map(entry => ({ value: entry.name, label: entry.name }))} />
          </Show>
          </Show>
          <Show when={selection()?.deleting && props.history.remotes.length > 0}>
            <p role="status" class="text-xs text-muted-foreground">{remoteTag() === "checking" ? t("tagDel06") : remoteTag() === "absent" ? t("tagDel07") : remoteTag() === "error" ? t("tagDel08") : ""}</p>
          </Show>
          <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
          <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={disabled()} onClick={() => setSelection(undefined)}>{t("add09")}</Button><Button type="submit" variant={selection()?.deleting ? "destructive" : "default"} disabled={disabled() || (deleteRemote() && remoteTag() !== "present") || ((!selection()?.deleting || deleteRemote()) && !props.history.remotes.some(entry => entry.name === remote()))}>{pending() ? t("add10") : selection()?.deleting ? t("tagDel01") : t("nav07")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
