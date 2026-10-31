import { Show } from "solid-js";

export type SectionIconName = "branches" | "tags" | "remotes" | "stash" | "changes" | "conflicts";
export function SectionIcon(props: { name: SectionIconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0">
    <Show when={props.name === "changes"}><path d="M14 3H5v18h14V8ZM14 3v5h5M8 13h8M8 17h5" /></Show>
    <Show when={props.name === "conflicts"}><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></Show>
    <Show when={props.name === "stash"}><path d="M3 8h18v4H3zM5 12v9h14v-9M9 16h6M5 8V3h14v5" /></Show>
    <Show when={props.name === "branches"}><circle cx="6" cy="5" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="19" r="3" /><path d="M6 8v8M18 9a9 9 0 0 1-9 9" /></Show>
    <Show when={props.name === "tags"}><path d="m3 3 8 .5L21 14l-7 7L3.5 11 3 3Z" /><circle cx="7.5" cy="7.5" r="1" /></Show>
    <Show when={props.name === "remotes"}><rect x="3" y="3" width="18" height="6" rx="2" /><rect x="3" y="15" width="18" height="6" rx="2" /><path d="M7 6h.01M7 18h.01M12 9v6" /></Show>
  </svg>;
}
export function Chevron() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ml-auto size-3 shrink-0 transition-transform group-data-[expanded]/section:rotate-90"><path d="m9 5 7 7-7 7" /></svg>;
}
