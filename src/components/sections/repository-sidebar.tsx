import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "~/components/ui/context-menu";
import type { ReferenceAction } from "./reference-action-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import TagsSection from "./tags-section";
import { t } from "~/lib/i18n";
import gitForkIcon from "~/assets/logo.svg";
import { For, Show, createSignal, createMemo, createEffect, on } from "solid-js";
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuSub, SidebarMenuSubItem, SidebarSeparator, SidebarResizeHandle,
} from "~/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import AddSidebarItem from "~/components/sections/add-sidebar-item";
import { SidebarSection } from "~/components/ui/sidebar-section";
import { SectionIcon, Chevron } from "~/components/ui/repository-icons";
import type { History, RepositoryMode } from "~/lib/git";

export default function RepositorySidebar(props: { history: History; mode: RepositoryMode; onModeChange: (mode: RepositoryMode) => void; onChangeProject: () => void; projectMenuOpen: boolean; onSettings: () => void; disabled: boolean; onSwitchBranch: (branch: string) => void; onCreateBranch: () => void; onRebaseBranch: (name: string) => void; onReferenceAction: (action: ReferenceAction) => void; onPushBranch: () => void; onCreateTag: (name: string) => Promise<void>; onPushTags: (remote: string, tag: string | null) => Promise<void>; onDeleteTag: (tag: string, remote: string | null) => Promise<void>; onAddRemote: (name: string, url: string) => Promise<void> }) {
  const [branchSearch, setBranchSearch] = createSignal("");
  const searchable = () => props.history.branches.length > 10;
  const branches = createMemo(() => {
    const query = searchable() ? branchSearch().trim().toLowerCase() : "";
    return props.history.branches.filter(branch => branch.toLowerCase().includes(query));
  });
  createEffect(on(() => props.history.path, () => setBranchSearch("")));
  createEffect(() => { if (!searchable()) setBranchSearch(""); });
  return <Sidebar collapsible="none" class="relative h-dvh shrink-0 border-r" aria-label={t("repo01")}>
    <SidebarHeader class="border-b p-4">
      <Button variant="ghost" class="h-auto w-full min-w-0 justify-start gap-2 px-2 py-2 text-left" disabled={props.disabled} onClick={props.onChangeProject} aria-label={t("switch04", { name: props.history.path.split(/[\\/]/).filter(Boolean).pop() ?? props.history.path })} aria-haspopup="dialog" aria-expanded={props.projectMenuOpen}>
        <img src={gitForkIcon} width="32" height="32" class="size-8 shrink-0" alt="" />
        <div class="flex h-8 min-w-0 flex-1 flex-col justify-center">
          <p class="truncate text-sm font-medium leading-4">{props.history.path.split(/[\\/]/).filter(Boolean).pop()}</p>
          <p class="truncate text-xs font-normal leading-4 text-muted-foreground" title={props.history.path}>{props.history.path}</p>
        </div>
        <svg aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>
      </Button>
      <nav class="mt-4 space-y-1" aria-label={t("nav08")}>
        <For each={[{ mode: "history" as const, label: t("mode01"), icon: "branches" as const, count: 0 }, { mode: "commit" as const, label: t("mode03"), icon: "changes" as const, count: props.history.has_changes ? 1 : 0 }, { mode: "conflicts" as const, label: t("conf01"), icon: "conflicts" as const, count: props.history.conflicts.length }, { mode: "stash" as const, label: t("stash01"), icon: "stash" as const, count: props.history.stashes.length }]}>{item =>
          <SidebarMenuButton disabled={props.disabled || ((item.mode === "conflicts" || item.mode === "stash") && item.count === 0)} isActive={props.mode === item.mode} aria-current={props.mode === item.mode ? "page" : undefined} onClick={() => props.onModeChange(item.mode)} class="h-9 gap-2 rounded-md data-[active=true]:bg-sidebar-selected data-[active=true]:text-sidebar-foreground">
            <SectionIcon name={item.icon} /><span class="min-w-0 flex-1 truncate">{item.label}</span>
            <Show when={item.count > 0}><span class="rounded bg-muted px-1.5 text-xs tabular-nums">{item.mode === "commit" ? "•" : item.count}</span></Show>
          </SidebarMenuButton>
        }</For>
      </nav>
    </SidebarHeader>
    <SidebarContent>
      <Show when={props.mode === "history"} fallback={
        <div class="mx-3 mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground" title={props.history.current_branch || t("repo04")}>
          <SectionIcon name="branches" /><span class="truncate">{props.history.current_branch || t("repo04")}</span>
        </div>
      }>
      <SidebarSection title={t("repo03")} count={props.history.branches.length} icon={<SectionIcon name="branches" />} action={<Button variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.disabled || !props.history.tip} onClick={props.onCreateBranch} aria-label={t("act17")} title={t("act17")}>+</Button>}>
        <SidebarGroupContent>
          <Show when={!props.history.current_branch}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo04")}</p></Show>
          <Show when={props.history.current_branch && !props.history.branches.includes(props.history.current_branch)}>
            <p class="break-all px-2 py-2 text-xs text-muted-foreground">{props.history.current_branch}</p>
          </Show>
          <Show when={searchable()}>
            <div class="relative mb-2 px-2">
              <TextField value={branchSearch()} onChange={setBranchSearch} disabled={props.disabled}>
                <TextFieldInput class="h-8 pr-8 text-xs" placeholder={t("branchFind01")} aria-label={t("branchFind01")}
                  onKeyDown={event => { if (event.key === "Escape" && branchSearch()) { event.preventDefault(); event.stopPropagation(); setBranchSearch(""); } }} />
              </TextField>
              <Show when={branchSearch()}><Button variant="ghost" size="icon" class="absolute right-3 top-1 size-6" disabled={props.disabled} aria-label={t("branchFind02")} onClick={() => setBranchSearch("")}>×</Button></Show>
            </div>
            <Show when={!branches().length}><p class="px-2 py-2 text-xs text-muted-foreground" role="status">{t("branchFind03")}</p></Show>
          </Show>
          <SidebarMenu>
            <For each={branches()}>{branch => <SidebarMenuItem><ContextMenu><ContextMenuTrigger as="div" class="flex min-w-0 items-center gap-1" disabled={props.disabled}>
              <SidebarMenuButton disabled={props.disabled} isActive={branch === props.history.current_branch}
                aria-current={branch === props.history.current_branch ? "true" : undefined}
                onClick={() => props.onSwitchBranch(branch)} title={branch}
                class="group/branch min-w-0 flex-1 h-8 min-h-8 justify-between gap-2 px-2 py-1 text-sm leading-5 data-[active=true]:bg-sidebar-selected data-[active=true]:text-sidebar-foreground data-[active=true]:font-normal data-[active=true]:hover:bg-sidebar-selected data-[active=true]:hover:text-sidebar-foreground">
                <span class="min-w-0 flex-1 truncate">{branch}</span>
                <Show when={props.history.branch_comparisons[branch]}>{comparison =>
                  <Show when={comparison().ahead > 0 || comparison().behind > 0}>
                  <span class="flex shrink-0 gap-1 text-2xs font-normal tabular-nums text-muted-foreground group-data-[active=true]/branch:text-branch-counter-foreground"
                    title={t("repo05", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}
                    aria-label={t("repo05", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}>
                    <Show when={comparison().ahead > 0}><span class="inline-flex items-center gap-1 rounded border border-sidebar-border group-data-[active=true]/branch:border-branch-counter group-data-[active=true]/branch:bg-branch-counter group-data-[active=true]/branch:text-branch-counter-foreground px-1 leading-4"><span aria-hidden="true">↑</span><span>{comparison().ahead}</span></span></Show>
                    <Show when={comparison().behind > 0}><span class="inline-flex items-center gap-1 rounded border border-sidebar-border group-data-[active=true]/branch:border-branch-counter group-data-[active=true]/branch:bg-branch-counter group-data-[active=true]/branch:text-branch-counter-foreground px-1 leading-4"><span aria-hidden="true">↓</span><span>{comparison().behind}</span></span></Show>
                  </span>
                  </Show>
                }</Show>
              </SidebarMenuButton>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-6 shrink-0" disabled={props.disabled} aria-label={t("refAct01", { name: branch })}>⋯</DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={props.disabled || branch === props.history.current_branch} onSelect={() => props.onSwitchBranch(branch)}>{t("refAct10")}</DropdownMenuItem>
                  <DropdownMenuItem title={branch !== props.history.current_branch ? t("refAct11") : undefined} disabled={props.disabled || branch !== props.history.current_branch || !props.history.tip} onSelect={props.onPushBranch}>{t("nav07")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={props.disabled || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch })}>{t("refAct02")}</DropdownMenuItem>
                  <DropdownMenuItem disabled={props.disabled || branch === props.history.current_branch || Boolean(props.history.operation) || props.history.has_changes || !props.history.current_branch} onSelect={() => props.onRebaseBranch(branch)}>{t("branchAct01")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive data-[highlighted]:text-destructive" disabled={props.disabled || branch === props.history.current_branch || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch, deleting: true })}>{t("refAct03")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </ContextMenuTrigger><ContextMenuContent>
                <ContextMenuItem class="text-destructive" disabled={props.disabled || branch === props.history.current_branch || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch, deleting: true })}>{t("refAct03")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled || branch === props.history.current_branch || Boolean(props.history.operation) || props.history.has_changes || !props.history.current_branch} onSelect={() => props.onRebaseBranch(branch)}>{t("branchAct01")}</ContextMenuItem>
                <ContextMenuItem disabled={props.disabled || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch })}>{t("refAct02")}</ContextMenuItem>
              </ContextMenuContent></ContextMenu>
            </SidebarMenuItem>}</For>
          </SidebarMenu>
          <Show when={!props.history.branches.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo06")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>
      <SidebarSeparator />
      <TagsSection history={props.history} disabled={props.disabled} onCreate={props.onCreateTag} onPush={props.onPushTags} onDelete={props.onDeleteTag} onRename={name => props.onReferenceAction({ kind: "tag", name })} />
      <SidebarSeparator />
      <SidebarSection title={t("repo09")} icon={<SectionIcon name="remotes" />} action={<AddSidebarItem kind="remote" disabled={props.disabled} onCreate={props.onAddRemote} />}>
        <SidebarGroupContent>
          <SidebarMenu>
            <For each={props.history.remotes}>{remote => <SidebarMenuItem>
              <Collapsible defaultOpen>
              <SidebarMenuButton as={CollapsibleTrigger} class="group/section h-8 px-2 py-1 text-sm font-medium leading-5" title={remote.name}>
                <span class="min-w-0 truncate">{remote.name}</span><Chevron />
              </SidebarMenuButton>
              <CollapsibleContent>
              <Show when={remote.branches.length} fallback={<p class="px-2 pb-2 text-xs text-muted-foreground">{t("repo10")}</p>}>
                <SidebarMenuSub>
                  <For each={remote.branches}>{branch => <SidebarMenuSubItem>
                    <p class="truncate py-1 text-xs text-muted-foreground" title={`${remote.name}/${branch}`}>{branch}</p>
                  </SidebarMenuSubItem>}</For>
                </SidebarMenuSub>
              </Show>
              </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>}</For>
          </SidebarMenu>
          <Show when={!props.history.remotes.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo11")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>

      </Show>
    </SidebarContent>
    <SidebarFooter class="border-t p-2">
      <Button variant="ghost" class="w-full justify-start gap-2" disabled={props.disabled} onClick={props.onSettings}>
        <svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9.5 3-.6 2.4-1.7 1-2.4-.7-2.5 4.3L4 11.7v2l-1.7 1.7 2.5 4.3 2.4-.7 1.7 1 .6 2.4h5l.6-2.4 1.7-1 2.4.7 2.5-4.3-1.7-1.7v-2l1.7-1.7-2.5-4.3-2.4.7-1.7-1L14.5 3Z" />
          <circle cx="12" cy="12.7" r="3" />
        </svg>
        {t("lang04")}
      </Button>
    </SidebarFooter>
    <SidebarResizeHandle />
  </Sidebar>;
}
