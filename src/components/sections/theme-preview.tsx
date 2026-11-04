import { SectionIcon } from "~/components/ui/repository-icons";
import { t } from "~/lib/i18n";

export default function ThemePreview(props: { theme: string; dark: boolean }) {
  return <figure class="mx-auto w-full max-w-[300px] space-y-1.5">
    <figcaption class="text-xs text-muted-foreground">{t("theme04")}</figcaption>
    <div aria-hidden="true" data-theme={props.theme} data-kb-theme={props.dark ? "dark" : "light"} class="theme-preview overflow-hidden rounded-md border bg-background text-xs text-foreground">
      <div class="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <span class="font-semibold">git-ui</span>
        <span class="rounded bg-primary px-2 py-1 text-primary-foreground">{t("nav07")}</span>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div class="space-y-2 border-r bg-sidebar p-2 text-sidebar-foreground">
          <span class="block truncate font-medium" title={t("repo03")}>{t("repo03")}</span>
          <div class="flex items-center gap-1 rounded bg-sidebar-selected px-2 py-1">
            <span class="shrink-0"><SectionIcon name="branches" /></span>
            <span class="truncate">main</span>
          </div>
          <div class="truncate px-2">feature/ui</div>
        </div>
        <div class="min-w-0">
          <div class="truncate border-b px-2 py-2 font-medium">{t("mode01")}</div>
          <div class="flex items-center gap-2 bg-accent px-2 py-1.5 text-accent-foreground">
            <span class="size-2 shrink-0 rounded-full bg-primary" />
            <span class="truncate">{t("theme05")}</span>
          </div>
          <div class="border-t bg-muted px-2 py-1.5 font-mono text-muted-foreground">theme.css</div>
          <div class="overflow-hidden font-mono">
            <div class="truncate bg-error px-2 py-1 text-error-foreground">− gap: 4px;</div>
            <div class="truncate bg-success px-2 py-1 text-success-foreground">+ gap: 8px;</div>
          </div>
        </div>
      </div>
    </div>
  </figure>;
}
