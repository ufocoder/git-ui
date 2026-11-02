import { t } from "~/lib/i18n";
import gitForkIcon from "~/assets/logo.svg";
import { For, Show } from "solid-js";
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuSub, SidebarMenuSubItem, SidebarSeparator, SidebarResizeHandle,
} from "~/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import AddSidebarItem from "~/components/sections/add-sidebar-item";
import { SidebarSection } from "~/components/ui/sidebar-section";
import { SectionIcon, Chevron } from "~/components/ui/repository-icons";
import type { History, RepositoryMode } from "~/lib/git";

export default function RepositorySidebar(props: { history: History; mode: RepositoryMode; onModeChange: (mode: RepositoryMode) => void; onChangeProject: () => void; projectMenuOpen: boolean; onSettings: () => void; disabled: boolean; onSwitchBranch: (branch: string) => void; onCreateBranch: () => void; onCreateTag: (name: string) => Promise<void>; onAddRemote: (name: string, url: string) => Promise<void> }) {
  return <Sidebar collapsible="none" class="relative h-dvh shrink-0 border-r" aria-label={t("repo01")}>
    <SidebarHeader class="border-b p-4">
      <Button variant="ghost" class="h-auto w-full min-w-0 justify-start gap-2 px-2 py-2 text-left" disabled={props.disabled} onClick={props.onChangeProject} aria-label={t("switch04", { name: props.history.path.split(/[\\/]/).filter(Boolean).pop() ?? props.history.path })} aria-haspopup="dialog" aria-expanded={props.projectMenuOpen}>
        <img src={gitForkIcon} width="32" height="32" class="size-8 shrink-0" alt="" />
        <div class="flex h-8 min-w-0 flex-1 flex-col justify-center">
          <p class="truncate text-sm font-semibold leading-4">{props.history.path.split(/[\\/]/).filter(Boolean).pop()}</p>
          <p class="truncate text-xs leading-4 text-muted-foreground" title={props.history.path}>{props.history.path}</p>
        </div>
        <svg aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>
      </Button>
      <nav class="mt-4 space-y-1" aria-label={t("nav08")}>
        <For each={[{ mode: "history" as const, label: t("mode01"), icon: "branches" as const, count: 0 }, { mode: "commit" as const, label: t("mode03"), icon: "changes" as const, count: props.history.has_changes ? 1 : 0 }, { mode: "conflicts" as const, label: t("conf01"), icon: "conflicts" as const, count: props.history.conflicts.length }, { mode: "stash" as const, label: t("stash01"), icon: "stash" as const, count: props.history.stashes.length }]}>{item =>
          <SidebarMenuButton disabled={props.disabled || ((item.mode === "conflicts" || item.mode === "stash") && item.count === 0)} isActive={props.mode === item.mode} aria-current={props.mode === item.mode ? "page" : undefined} onClick={() => props.onModeChange(item.mode)} class="h-9 gap-2 rounded-md data-[active=true]:bg-blue-500/10 data-[active=true]:text-blue-600">
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
          <SidebarMenu>
            <For each={props.history.branches}>{branch => <SidebarMenuItem>
              <SidebarMenuButton disabled={props.disabled} isActive={branch === props.history.current_branch}
                aria-current={branch === props.history.current_branch ? "true" : undefined}
                onClick={() => props.onSwitchBranch(branch)} title={branch}
                class="group/branch h-8 min-h-8 justify-between gap-2 px-2 py-1 text-sm leading-5 data-[active=true]:bg-[#c8c8c8] data-[active=true]:text-[#3d3d3d] data-[active=true]:font-normal data-[active=true]:hover:bg-[#c8c8c8] data-[active=true]:hover:text-[#3d3d3d]">
                <span class="min-w-0 truncate">{branch}</span>
                <Show when={props.history.branch_comparisons[branch]}>{comparison =>
                  <Show when={comparison().ahead > 0 || comparison().behind > 0}>
                  <span class="flex shrink-0 gap-1 font-mono text-[10px] font-normal tabular-nums text-muted-foreground group-data-[active=true]/branch:text-zinc-100"
                    title={t("repo05", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}
                    aria-label={t("repo05", { p1: comparison().base, p2: comparison().ahead, p3: comparison().behind })}>
                    <Show when={comparison().ahead > 0}><span class="inline-flex items-center gap-1 rounded border border-sidebar-border group-data-[active=true]/branch:border-[#808080] group-data-[active=true]/branch:bg-[#808080] group-data-[active=true]/branch:text-white px-1 leading-4"><span aria-hidden="true">↑</span><span>{comparison().ahead}</span></span></Show>
                    <Show when={comparison().behind > 0}><span class="inline-flex items-center gap-1 rounded border border-sidebar-border group-data-[active=true]/branch:border-[#808080] group-data-[active=true]/branch:bg-[#808080] group-data-[active=true]/branch:text-white px-1 leading-4"><span aria-hidden="true">↓</span><span>{comparison().behind}</span></span></Show>
                  </span>
                  </Show>
                }</Show>
              </SidebarMenuButton>
            </SidebarMenuItem>}</For>
          </SidebarMenu>
          <Show when={!props.history.branches.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo06")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>
      <SidebarSeparator />
      <SidebarSection title={t("repo07")} icon={<SectionIcon name="tags" />} action={<AddSidebarItem kind="tag" disabled={props.disabled || !props.history.tip} onCreate={name => props.onCreateTag(name)} />}>
        <SidebarGroupContent>
          <SidebarMenu>
            <For each={props.history.tags}>{tag => <SidebarMenuItem>
              <div class="flex h-8 items-center px-2 py-1 text-sm leading-5" title={tag}><span class="truncate">{tag}</span></div>
            </SidebarMenuItem>}</For>
          </SidebarMenu>
          <Show when={!props.history.tags.length}><p class="px-2 py-2 text-xs text-muted-foreground">{t("repo08")}</p></Show>
        </SidebarGroupContent>
      </SidebarSection>
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
    <SidebarFooter class="border-t p-2"><Button variant="ghost" class="w-full justify-start" disabled={props.disabled} onClick={props.onSettings}>{t("lang04")}</Button></SidebarFooter>
    <SidebarResizeHandle />
  </Sidebar>;
}
