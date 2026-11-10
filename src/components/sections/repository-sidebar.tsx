import { WindowedList } from "~/components/ui/windowed-list";
import { git } from "~/lib/git";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "~/components/ui/context-menu";
import type { ReferenceAction } from "./reference-action-dialog";
import TagsSection from "./tags-section";
import { t } from "~/lib/i18n";
import gitForkIcon from "~/assets/logo.svg";
import { For, Show, createSignal, createMemo, createEffect, on, onCleanup } from "solid-js";
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuSubItem, SidebarSeparator, SidebarResizeHandle,
} from "~/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import AddSidebarItem from "~/components/sections/add-sidebar-item";
import { SidebarSection } from "~/components/ui/sidebar-section";
import { SectionIcon, Chevron } from "~/components/ui/repository-icons";
import type { History, RepositoryMode } from "~/lib/git";

export default function RepositorySidebar(props: { onStashListMount: (element: HTMLDivElement) => void; history: History; mode: RepositoryMode; onModeChange: (mode: RepositoryMode) => void; onChangeProject: () => void; projectMenuOpen: boolean; onSettings: () => void; disabled: boolean; onSwitchBranch: (branch: string) => void; onCreateBranch: () => void; onRebaseBranch: (name: string) => void; onReferenceAction: (action: ReferenceAction) => void; onPushBranch: () => void; onCreateTag: (name: string) => Promise<void>; onPushTags: (remote: string, tag: string | null) => Promise<void>; onDeleteTag: (tag: string, remote: string | null) => Promise<void>; onAddRemote: (name: string, url: string) => Promise<void> }) {
  const [branchSearch, setBranchSearch] = createSignal("");
  const searchable = () => props.history.branches.length > 10;
  const branches = createMemo(() => {
    const query = searchable() ? branchSearch().trim().toLowerCase() : "";
    return props.history.branches.filter(branch => branch.toLowerCase().includes(query));
  });
  createEffect(on(() => props.history.path, () => setBranchSearch("")));
  createEffect(() => { if (!searchable()) setBranchSearch(""); });
  const [visibleBranches, setVisibleBranches] = createSignal<readonly string[]>([]);
  const [comparisons, setComparisons] = createSignal<History["branch_comparisons"]>({});
  const comparisonSnapshot = createMemo(() => JSON.stringify([props.history.path, props.history.tip, props.history.current_branch, props.history.sync.upstream, props.history.branch_tips]));
  let requestedComparisons = new Set<string>();
  let comparisonGeneration = 0;
  let comparisonTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(comparisonSnapshot, () => { comparisonGeneration++; requestedComparisons = new Set(); setComparisons({}); }));
  createEffect(() => {
    const names = visibleBranches().filter(name => !comparisons()[name] && !requestedComparisons.has(name));
    const generation = comparisonGeneration;
    const active = props.mode === "history";
    clearTimeout(comparisonTimer);
    if (!active || !names.length) return;
    comparisonTimer = setTimeout(() => {
      names.forEach(name => requestedComparisons.add(name));
      void git.getBranchComparisons([...names]).then(result => {
        if (generation === comparisonGeneration) setComparisons(previous => ({ ...previous, ...result }));
      }).catch(() => {
        if (generation === comparisonGeneration) names.forEach(name => requestedComparisons.delete(name));
      });
    }, 150);
  });
  onCleanup(() => { comparisonGeneration++; clearTimeout(comparisonTimer); });
  function branchActions(branch: string) {
    return <>
      <ContextMenuItem disabled={props.disabled || props.history.git_lfs_missing || branch === props.history.current_branch} onSelect={() => props.onSwitchBranch(branch)}>{t("ref-action.switch")}</ContextMenuItem>
      <ContextMenuItem title={branch !== props.history.current_branch ? t("ref-action.switch-before-push") : undefined} disabled={props.disabled || props.history.git_lfs_missing || branch !== props.history.current_branch || !props.history.tip} onSelect={props.onPushBranch}>{t("push.action")}</ContextMenuItem>
      <ContextMenuItem disabled={props.disabled || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch })}>{t("ref-action.rename")}</ContextMenuItem>
      <ContextMenuItem disabled={props.disabled || props.history.git_lfs_missing || branch === props.history.current_branch || Boolean(props.history.operation) || props.history.has_changes || !props.history.current_branch} onSelect={() => props.onRebaseBranch(branch)}>{t("branch-action.rebase")}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem class="text-destructive data-[highlighted]:text-destructive" disabled={props.disabled || branch === props.history.current_branch || Boolean(props.history.operation)} onSelect={() => props.onReferenceAction({ kind: "branch", name: branch, deleting: true })}>{t("ref-action.delete-branch")}</ContextMenuItem>
    </>;
  }
  return <Sidebar collapsible="none" class="relative h-dvh shrink-0 border-r" aria-label={t("sidebar.navigation")}>
    <SidebarHeader class="border-b p-2">
      <div class="flex min-w-0 items-center gap-1">
        <Button variant="ghost" class="h-auto flex-1 min-w-0 justify-start gap-2 px-2 py-2 text-left" disabled={props.disabled} onClick={props.onChangeProject} aria-label={t("project.switch-to", { name: props.history.path.split(/[\\/]/).filter(Boolean).pop() ?? props.history.path })} aria-haspopup="dialog" aria-expanded={props.projectMenuOpen}>
          <img src={gitForkIcon} width="32" height="32" class="size-8 shrink-0" alt="" />
          <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <p class="truncate text-base font-medium leading-5">{props.history.path.split(/[\\/]/).filter(Boolean).pop()}</p>
          </div>
          <svg aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>
        </Button>
      </div>
      <nav class="mt-3 space-y-1" aria-label={t("toolbar.modes")}>
        <For each={[{ mode: "history" as const, label: t("mode.history"), icon: "branches" as const, count: 0 }, { mode: "commit" as const, label: t("mode.changes"), icon: "changes" as const, count: props.history.has_changes ? 1 : 0 }, { mode: "conflicts" as const, label: t("conflict.title"), icon: "conflicts" as const, count: props.history.conflicts.length }, { mode: "stash" as const, label: t("stash.title"), icon: "stash" as const, count: props.history.stashes.length }]}>{item =>
          <SidebarMenuButton disabled={props.disabled || (item.mode !== "history" && (props.history.git_lfs_missing || item.count === 0))} isActive={props.mode === item.mode} aria-current={props.mode === item.mode ? "page" : undefined} onClick={() => props.onModeChange(item.mode)} class="h-9 gap-2 rounded-md data-[active=true]:bg-sidebar-selected data-[active=true]:text-sidebar-foreground">
            <SectionIcon name={item.icon} /><span class="min-w-0 flex-1 truncate">{item.label}</span>
            <Show when={item.count > 0}><span class="rounded bg-muted px-1.5 text-xs tabular-nums">{item.mode === "commit" ? "•" : item.count}</span></Show>
          </SidebarMenuButton>
        }</For>
      </nav>
    </SidebarHeader>
    <SidebarContent data-sidebar-scroll class="overflow-x-hidden overflow-y-scroll [scrollbar-gutter:stable]">
      <div class="flex shrink-0 flex-col gap-2">
      <Show when={props.mode === "conflicts"}>
        <div class="mx-2 mt-2 flex items-center gap-2 rounded-md border px-2 py-2 text-xs text-muted-foreground" title={props.history.current_branch || t("sidebar.detached")}>
          <SectionIcon name="branches" /><span class="truncate">{props.history.current_branch || t("sidebar.detached")}</span>
        </div>
      </Show>
      <Show when={props.mode === "history"}>
      <SidebarSection title={t("sidebar.branches")} icon={<SectionIcon name="branches" />} action={<Button variant="ghost" size="icon" class="size-7 shrink-0" disabled={props.disabled || props.history.git_lfs_missing || !props.history.tip} onClick={props.onCreateBranch} aria-label={t("branch.create")} title={t("branch.create")}>+</Button>}>
        <SidebarGroupContent>
          <Show when={!props.history.current_branch}><p class="px-2 py-2 text-xs text-muted-foreground">{t("sidebar.detached")}</p></Show>
          <Show when={props.history.current_branch && !props.history.branches.includes(props.history.current_branch)}>
            <p class="break-all px-2 py-2 text-xs text-muted-foreground">{props.history.current_branch}</p>
          </Show>
          <Show when={searchable()}>
            <div class="relative mb-2 px-2">
              <TextField value={branchSearch()} onChange={setBranchSearch} disabled={props.disabled}>
                <TextFieldInput class="h-8 pr-8 text-xs" placeholder={t("branch-search.search")} aria-label={t("branch-search.search")}
                  onKeyDown={event => { if (event.key === "Escape" && branchSearch()) { event.preventDefault(); event.stopPropagation(); setBranchSearch(""); } }} />
              </TextField>
              <Show when={branchSearch()}><Button variant="ghost" size="icon" class="absolute right-3 top-1 size-6" disabled={props.disabled} aria-label={t("branch-search.clear")} onClick={() => setBranchSearch("")}>×</Button></Show>
            </div>
            <Show when={!branches().length}><p class="px-2 py-2 text-xs text-muted-foreground" role="status">{t("branch-search.empty")}</p></Show>
          </Show>
          <WindowedList items={branches()} onVisibleChange={setVisibleBranches}>{branch => <SidebarMenuItem><ContextMenu>
              <ContextMenuTrigger as={SidebarMenuButton} disabled={props.disabled} isActive={branch === props.history.current_branch}
                aria-current={branch === props.history.current_branch ? "true" : undefined}
                onClick={() => props.onSwitchBranch(branch)} title={branch}
                class="group/branch min-w-0 flex-1 h-8 min-h-8 justify-between gap-2 pl-8 pr-2 py-1 text-sm leading-5 data-[active=true]:bg-sidebar-selected data-[active=true]:text-sidebar-foreground data-[active=true]:font-normal data-[active=true]:hover:bg-sidebar-selected data-[active=true]:hover:text-sidebar-foreground">
                <span class="min-w-0 flex-1 truncate">{branch}</span>
                <Show when={comparisons()[branch]}>{comparison =>
                  <Show when={comparison().ahead > 0 || comparison().behind > 0}>
                  <span class="inline-flex shrink-0 items-center gap-1 rounded bg-muted-foreground px-1.5 text-2xs font-medium leading-4 tabular-nums text-background"
                    title={t("sidebar.comparison", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}
                    aria-label={t("sidebar.comparison", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}>
                    <Show when={comparison().ahead > 0}><span aria-hidden="true">{comparison().ahead}↑</span></Show>
                    <Show when={comparison().behind > 0}><span aria-hidden="true">{comparison().behind}↓</span></Show>
                  </span>
                  </Show>
                }</Show>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {branchActions(branch)}
              </ContextMenuContent></ContextMenu>
            </SidebarMenuItem>}</WindowedList>
          <Show when={!props.history.branches.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("sidebar.no-branches")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>
      <SidebarSeparator />
      <TagsSection history={props.history} disabled={props.disabled} onCreate={props.onCreateTag} onPush={props.onPushTags} onDelete={props.onDeleteTag} onRename={name => props.onReferenceAction({ kind: "tag", name })} />
      <SidebarSeparator />
      <SidebarSection title={t("sidebar.remotes")} icon={<SectionIcon name="remotes" />} action={<AddSidebarItem kind="remote" disabled={props.disabled} onCreate={props.onAddRemote} />}>
        <SidebarGroupContent>
          <SidebarMenu>
            <For each={props.history.remotes}>{remote => <SidebarMenuItem>
              <Collapsible defaultOpen>
              <SidebarMenuButton as={CollapsibleTrigger} class="group/section h-8 pl-8 pr-2 py-1 text-sm font-medium leading-5" title={remote.name}>
                <span class="min-w-0 truncate">{remote.name}</span><Chevron />
              </SidebarMenuButton>
              <CollapsibleContent class="ml-8 pl-3">
                <Show when={remote.branches.length} fallback={<p class="pb-2 text-xs text-muted-foreground">{t("sidebar.unfetched")}</p>}>
                  <WindowedList items={remote.branches}>{branch => <SidebarMenuSubItem>
                    <p class="h-8 truncate pr-2 text-xs leading-8 text-muted-foreground" title={`${remote.name}/${branch}`}>{branch}</p>
                  </SidebarMenuSubItem>}</WindowedList>
                </Show>
              </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>}</For>
          </SidebarMenu>
          <Show when={!props.history.remotes.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("sidebar.no-remotes")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>

      </Show>
      <Show when={props.mode === "stash"}><div ref={props.onStashListMount} /></Show>
      </div>
    </SidebarContent>
    <SidebarFooter class="border-t p-2">
      <Button variant="ghost" class="w-full justify-start gap-2 px-2" disabled={props.disabled} onClick={props.onSettings}>
        <svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9.5 3-.6 2.4-1.7 1-2.4-.7-2.5 4.3L4 11.7v2l-1.7 1.7 2.5 4.3 2.4-.7 1.7 1 .6 2.4h5l.6-2.4 1.7-1 2.4.7 2.5-4.3-1.7-1.7v-2l1.7-1.7-2.5-4.3-2.4.7-1.7-1L14.5 3Z" />
          <circle cx="12" cy="12.7" r="3" />
        </svg>
        {t("settings.title")}
      </Button>
    </SidebarFooter>
    <SidebarResizeHandle />
  </Sidebar>;
}
