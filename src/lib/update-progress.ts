export function downloadPercent(status: { downloaded: number; total: number | null } | undefined): number | undefined {
  if (!status || status.total === null || !Number.isFinite(status.total) || status.total <= 0 || !Number.isFinite(status.downloaded)) return undefined;
  return Math.min(100, Math.max(0, Math.round(status.downloaded / status.total * 100)));
}

export function setNativeProgressValue(element: Pick<HTMLProgressElement, "value" | "removeAttribute">, value: number | undefined) {
  // WebKit throws when the numeric .value property receives undefined/NaN.
  // An absent value attribute is the native indeterminate state.
  if (value === undefined || !Number.isFinite(value)) element.removeAttribute("value");
  else element.value = Math.min(100, Math.max(0, value));
}
