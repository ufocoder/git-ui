import { SectionIcon } from "~/components/ui/repository-icons";
import { t } from "~/lib/i18n";

export default function ThemePreview(props: { theme: string; dark: boolean }) {
  return <span class="mx-auto block w-full max-w-[300px]" aria-hidden="true">
    <span aria-hidden="true" data-theme={props.theme} data-kb-theme={props.dark ? "dark" : "light"} class="theme-preview block overflow-hidden rounded-md border bg-background text-xs text-foreground">
      <span class="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <span class="font-semibold">git-ui</span>
        <span class="rounded bg-primary px-2 py-1 text-primary-foreground">{t("push.action")}</span>
      </span>
      <span class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <span class="block space-y-2 border-r bg-sidebar p-2 text-sidebar-foreground">
          <span class="block truncate font-medium" title={t("sidebar.branches")}>{t("sidebar.branches")}</span>
          <span class="flex items-center gap-1 rounded bg-sidebar-selected px-2 py-1">
            <span class="shrink-0"><SectionIcon name="branches" /></span>
            <span class="block truncate">main</span>
          </span>
          <span class="block truncate px-2">feature/ui</span>
        </span>
        <span class="block min-w-0">
          <span class="block truncate border-b px-2 py-2 font-medium">{t("mode.history")}</span>
          <span class="flex items-center gap-2 bg-accent px-2 py-1.5 text-accent-foreground">
            <span class="size-2 shrink-0 rounded-full bg-primary" />
            <span class="block truncate">{t("theme.sample")}</span>
          </span>
          <span class="block border-t bg-muted px-2 py-1.5 font-mono text-muted-foreground">theme.css</span>
          <span class="block overflow-hidden font-mono">
            <span class="block truncate bg-error px-2 py-1 text-error-foreground">− gap: 4px;</span>
            <span class="block truncate bg-success px-2 py-1 text-success-foreground">+ gap: 8px;</span>
          </span>
        </span>
      </span>
    </span>
  </span>;
}
