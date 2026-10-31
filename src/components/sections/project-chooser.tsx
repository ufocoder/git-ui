import { t } from "~/lib/i18n";
import gitForkIcon from "~/assets/logo.svg";
import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";

type ProjectChooserProps = {
  busy: boolean;
  selected: string;
  recentProjects: string[];
  onSelectProject: () => void;
  onOpenRecent: (path: string) => void;
};
export default function ProjectChooser(props: ProjectChooserProps) {
  return (
    <div class="mx-auto w-full max-w-2xl space-y-8">
      <section class="flex flex-col items-center text-center" aria-labelledby="welcome-title">
        <h1 id="welcome-title" class="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          <span class="mb-3 flex items-center justify-center gap-3">
            <img src={gitForkIcon} width="48" height="48" class="size-10 shrink-0 sm:size-12" alt="" />
            <span>{t("home01")}</span>
          </span>
          <span class="text-muted-foreground">{t("home02")}</span>
        </h1>
        <p class="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t("home03")}<br class="hidden sm:block" /> {t("home04")}
        </p>
        <Button size="lg" class="mt-6 h-12 gap-3 rounded-lg px-6" onClick={props.onSelectProject} disabled={props.busy}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 17V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2" />
            <path d="M5 11h16a1 1 0 0 1 1 1.3l-2 6A2.5 2.5 0 0 1 17.6 20H5a2 2 0 0 1-2-2l1-6a1 1 0 0 1 1-1Z" />
          </svg>
          {props.busy ? t("init03") : t("home05")}
        </Button>
        <Show when={props.selected}><p class="mt-3 max-w-full break-all text-xs text-muted-foreground" role="status">{t("home06", { path: props.selected })}</p></Show>
      </section>
      <Show when={props.recentProjects.length > 0}>
      <section aria-labelledby="recent-projects-title" class="mx-auto w-full max-w-lg">
        <div class="mb-2 flex items-center gap-3 px-3">
          <h2 id="recent-projects-title" class="shrink-0 text-xs font-medium text-muted-foreground">{t("home07")}</h2>
          <div class="h-px flex-1 bg-border/60" aria-hidden="true" />
        </div>
          <ul class="max-h-60 space-y-1 overflow-y-auto">
            <For each={props.recentProjects.slice(0, 3)}>{path =>
              <li>
                <Button variant="ghost" class="group h-auto w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-left" disabled={props.busy}
                  onClick={() => void props.onOpenRecent(path)} title={path}>
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><FolderIcon /></span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate text-sm font-medium">{path.split(/[\\/]/).filter(Boolean).pop() ?? path}</span>
                    <span class="truncate text-xs font-normal text-muted-foreground">{path}</span>
                  </span>
                  <span aria-hidden="true" class="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">→</span>
                </Button>
              </li>
            }</For>
          </ul>
      </section>
      </Show>
    </div>
  );
}

function FolderIcon() {
  return <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>;
}
