import { displayProjectPath } from "~/lib/project-path";
import { For, Show, createMemo } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import { t } from "~/lib/i18n";

type Props = {
  open: boolean;
  currentPath: string;
  recentProjects: string[];
  pending: boolean;
  choosingProject: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  onOpenFolder: () => void;
};

export default function ProjectSwitcherDialog(props: Props) {
  const projects = createMemo(() => [...new Set([props.currentPath, ...props.recentProjects].filter(Boolean))].slice(0, 3));
  return <Dialog open={props.open} onOpenChange={open => { if (!props.pending) props.onOpenChange(open); }}>
    <Show when={props.open}><DialogContent class="gap-3 p-5 sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{t("project.switch")}</DialogTitle>
        <DialogDescription>{t("project.choose-recent")}</DialogDescription>
      </DialogHeader>
      <ul class="space-y-1" aria-label={t("home.recent")}>
        <For each={projects()}>{path => <li>
          <Button variant="ghost" class="h-auto w-full justify-start gap-3 px-3 py-3 text-left" disabled={props.pending}
            aria-current={path === props.currentPath ? "true" : undefined} onClick={() => path === props.currentPath ? props.onOpenChange(false) : props.onSelect(path)}>
            <svg aria-hidden="true" class="size-5 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /></svg>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{path.split(/[\\/]/).filter(Boolean).pop() ?? path}</span>
              <span class="block break-all text-xs font-normal text-muted-foreground">{displayProjectPath(path)}</span>
            </span>
            <Show when={path === props.currentPath}><span class="shrink-0" aria-label={t("project.current")}>✓</span></Show>
          </Button>
        </li>}</For>
      </ul>
      <Show when={props.error}><Alert variant="destructive"><AlertTitle>{t("app.action-failed")}</AlertTitle><AlertDescription class="break-all">{props.error}</AlertDescription></Alert></Show>
      <div class="border-t pt-3">
        <Button variant="outline" class="w-full gap-2" disabled={props.pending} aria-busy={props.pending} onClick={props.onOpenFolder}>
          <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2M5 11h16l-3 9H3Z" /></svg>
          {props.choosingProject ? t("init.opening") : t("project.open-folder")}
        </Button>
      </div>
    </DialogContent></Show>
  </Dialog>;
}
