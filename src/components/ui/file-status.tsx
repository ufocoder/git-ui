import { t } from "~/lib/i18n";
const statuses = (): Record<string, { label: string; symbol: string; color: string }> => ({
  A: { label: t("file01"), symbol: "+", color: "text-success-foreground" },
  M: { label: t("file02"), symbol: "✎", color: "text-info-foreground" },
  D: { label: t("file03"), symbol: "−", color: "text-destructive" },
  R: { label: t("file04"), symbol: "→", color: "text-warning-foreground" },
  C: { label: t("file05"), symbol: "⧉", color: "text-info-foreground" },
  U: { label: t("file06"), symbol: "!", color: "text-destructive" },
  T: { label: t("file07"), symbol: "↔", color: "text-warning-foreground" },
});
export function FileStatus(props: { status: string }) {
  const info = () => statuses()[props.status] ?? { label: t("file02"), symbol: "•", color: "text-muted-foreground" };
  return <span role="img" aria-label={info().label} title={info().label} class={`inline-flex size-5 shrink-0 items-center justify-center font-mono text-lg font-semibold ${info().color}`}>{info().symbol}</span>;
}
