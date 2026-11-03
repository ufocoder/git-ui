import { createEffect } from "solid-js";
import { setNativeProgressValue } from "~/lib/update-progress";

export function Progress(props: { value: number | undefined; label: string }) {
  let element!: HTMLProgressElement;
  createEffect(() => setNativeProgressValue(element, props.value));
  return <progress ref={node => { element = node; }} class="h-2 w-full accent-primary" max="100" aria-label={props.label} />;
}
