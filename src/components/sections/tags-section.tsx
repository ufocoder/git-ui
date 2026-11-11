import SearchableReferenceList from "./searchable-reference-list";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "~/components/ui/context-menu";
import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { t } from "~/lib/i18n";
import { git, type History } from "~/lib/git";
import { SidebarSection } from "~/components/ui/sidebar-section";
import { SidebarGroupContent, SidebarMenuItem } from "~/components/ui/sidebar";
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
    <SidebarSection title={t("sidebar.tags")} icon={<SectionIcon name="tags" />} action={
      <AddSidebarItem kind="tag" disabled={disabled() || !props.history.tip} onCreate={name => props.onCreate(name)} />
    }>
      <SidebarGroupContent><SearchableReferenceList items={props.history.tags} disabled={disabled()} label={t("tag-search.search")} clearLabel={t("tag-search.clear")} emptyLabel={t("tag-search.empty")}>{tag => <SidebarMenuItem>
          <ContextMenu>
            <ContextMenuTrigger as="div" tabIndex={disabled() ? -1 : 0} disabled={disabled()} class="flex h-8 min-w-0 items-center rounded-md pl-8 pr-2 py-1 text-sm leading-5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span class="truncate" title={tag}>{tag}</span>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem disabled={disabled()} onSelect={() => open(tag)}>{t("tag-push.selected", { tag })}</ContextMenuItem>
              <ContextMenuItem disabled={disabled()} onSelect={() => open(null)}>{t("tag-push.all")}</ContextMenuItem>
              <ContextMenuItem disabled={disabled()} onSelect={() => props.onRename(tag)}>{t("ref-action.rename")}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem class="text-destructive" title={t("tag-delete.selected", { tag })} disabled={disabled()} onSelect={() => open(tag, true)}>{t("tag-delete.title")}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </SidebarMenuItem>}</SearchableReferenceList><Show when={!props.history.tags.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("sidebar.no-tags")}</p></Show></SidebarGroupContent>
    </SidebarSection>
    <Dialog open={Boolean(selection())} onOpenChange={value => { if (!value && !disabled()) setSelection(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{selection()?.deleting ? t("tag-delete.title") : t("tag-push.title")}</DialogTitle><DialogDescription>{selection()?.deleting ? t("tag-delete.description", { tag: selection()?.tag ?? "" }) : selection()?.tag === null ? t("tag-push.all-description", { count: props.history.tags.length }) : t("tag-push.selected", { tag: selection()?.tag ?? "" })}</DialogDescription></DialogHeader>
        <form onSubmit={submit} class="space-y-4">
          <Show when={selection()?.deleting && props.history.remotes.length}>
            <label class="flex items-center gap-2 text-sm"><Checkbox checked={deleteRemote()} onChange={setDeleteRemote} disabled={disabled() || remoteTag() !== "present"} />{t("tag-delete.remote")}</label>
          </Show>
          <Show when={!selection()?.deleting || props.history.remotes.length > 0}>
          <Show when={props.history.remotes.length} fallback={<p class="text-sm text-muted-foreground">{t("tag-push.no-remote")}</p>}>
            <SelectField label={t("upstream.remote")} value={remote()} onChange={setRemote} disabled={disabled()} options={props.history.remotes.map(entry => ({ value: entry.name, label: entry.name }))} />
          </Show>
          </Show>
          <Show when={selection()?.deleting && props.history.remotes.length > 0}>
            <p role="status" class="text-xs text-muted-foreground">{remoteTag() === "checking" ? t("tag-delete.checking") : remoteTag() === "absent" ? t("tag-delete.absent") : remoteTag() === "error" ? t("tag-delete.check-error") : ""}</p>
          </Show>
          <Show when={error()}><p role="alert" class="break-words text-sm text-destructive">{error()}</p></Show>
          <DialogFooter class="gap-2"><Button type="button" variant="outline" disabled={disabled()} onClick={() => setSelection(undefined)}>{t("common.cancel")}</Button><Button type="submit" variant={selection()?.deleting ? "destructive" : "default"} disabled={disabled() || (deleteRemote() && remoteTag() !== "present") || ((!selection()?.deleting || deleteRemote()) && !props.history.remotes.some(entry => entry.name === remote()))}>{pending() ? t("common.saving") : selection()?.deleting ? t("tag-delete.title") : t("push.action")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
