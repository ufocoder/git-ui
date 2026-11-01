/* @refresh reload */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ErrorBoundary } from "solid-js";
import { t } from "./lib/i18n";
import { Button } from "./components/ui/button";
import { render } from "solid-js/web";
import "./ui.css";
import App from "./App";
import { initializeLanguage } from "./lib/language-preferences";

// Solid delegates component events to document. Suppress the native menu only
// afterwards, so library handlers can open their own context menus first.
const suppressNativeContextMenu = (event: MouseEvent) => event.preventDefault();
window.addEventListener("contextmenu", suppressNativeContextMenu);
import.meta.hot?.dispose(() => window.removeEventListener("contextmenu", suppressNativeContextMenu));

async function start() {
  await initializeLanguage().catch(console.error);
  render(() => <ErrorBoundary fallback={error => <main class="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
    <h1 class="text-lg font-semibold">{t("crash01")}</h1>
    <p class="text-sm text-muted-foreground">{t("crash02")}</p>
    <pre role="alert" class="max-h-60 max-w-full select-text overflow-auto whitespace-pre-wrap break-all rounded-md border p-4 text-xs">{String(error?.stack ?? error)}</pre>
    <Button onClick={() => window.location.reload()}>{t("crash03")}</Button>
  </main>}><App /></ErrorBoundary>, document.getElementById("root") as HTMLElement);

  // Hidden WebViews can suspend animation frames. Reveal after mounting instead.
  if (isTauri()) {
    void invoke("frontend_ready").catch(console.error);
  }
}
void start();
