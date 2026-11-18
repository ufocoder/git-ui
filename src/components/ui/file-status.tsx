import { Show } from "solid-js";
import { t } from "~/lib/i18n";
const statuses = (): Record<string, { label: string; symbol: string }> => ({
  A: { label: t("file.added"), symbol: "+" },
  M: { label: t("file.modified"), symbol: "✎" },
  D: { label: t("file.deleted"), symbol: "−" },
  R: { label: t("file.renamed"), symbol: "→" },
  C: { label: t("file.copied"), symbol: "⧉" },
  U: { label: t("file.conflict"), symbol: "!" },
  T: { label: t("file.type-changed"), symbol: "↔" },
});
export function FileStatus(props: { status: string }) {
  const info = () => statuses()[props.status] ?? { label: t("file.modified"), symbol: "•" };
  return <span role="img" aria-label={info().label} title={info().label} class="inline-flex size-4 shrink-0 items-center justify-center font-mono text-lg font-semibold text-muted-foreground"><Show when={props.status === "M"} fallback={info().symbol}><svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path transform="translate(3 3.667) scale(0.666667)" stroke-width="2.25" d="M12 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v4M14 2v6h6M16 17l3 3M13 23l4-1 6-6a2.1 2.1 0 0 0-3-3l-6 6-1 4Z" /></svg></Show></span>;
}
