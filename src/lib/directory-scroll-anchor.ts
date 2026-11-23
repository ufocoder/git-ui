// Reconcile all file expansions in a frame against one stable file wrapper.
// User input cancels reconciliation so it never fights intentional scrolling.
export function createDirectoryScrollAnchor(viewport: HTMLElement) {
  let pending: { element: HTMLElement; offset: number } | undefined;
  let frame = 0;
  function cancel() { pending = undefined; cancelAnimationFrame(frame); frame = 0; }
  function preserve(change: () => void) {
    if (!pending) {
      const edge = viewport.getBoundingClientRect();
      const hit = document.elementFromPoint(edge.left + Math.min(32, edge.width / 2), edge.top + 1)?.closest<HTMLElement>("[data-directory-file]");
      const element = hit && viewport.contains(hit) ? hit : [...viewport.querySelectorAll<HTMLElement>("[data-directory-file]")].find(element => {
        const rect = element.getBoundingClientRect(); return rect.bottom > edge.top && rect.top < edge.bottom;
      });
      if (element) pending = { element, offset: element.getBoundingClientRect().top - edge.top };
    }
    change();
    if (!pending || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const anchor = pending; pending = undefined;
      if (!anchor?.element.isConnected) return;
      viewport.scrollTop += anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
    });
  }
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) viewport.addEventListener(event, cancel, { passive: true });
  return { preserve, dispose() { cancel(); for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) viewport.removeEventListener(event, cancel); } };
}
