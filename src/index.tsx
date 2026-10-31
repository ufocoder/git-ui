/* @refresh reload */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { render } from "solid-js/web";
import "./ui.css";
import App from "./App";

// Solid delegates component events to document. Suppress the native menu only
// afterwards, so library handlers can open their own context menus first.
const suppressNativeContextMenu = (event: MouseEvent) => event.preventDefault();
window.addEventListener("contextmenu", suppressNativeContextMenu);
import.meta.hot?.dispose(() => window.removeEventListener("contextmenu", suppressNativeContextMenu));

render(() => <App />, document.getElementById("root") as HTMLElement);

// Hidden WebViews can suspend animation frames. Reveal after mounting instead.
if (isTauri()) {
  void invoke("frontend_ready").catch(console.error);
}
