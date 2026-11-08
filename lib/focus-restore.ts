export function restoreFocus(target: HTMLElement | null): void {
  if (target && target.isConnected && !target.matches(":disabled")) {
    target.focus();
    return;
  }
  document.querySelector<HTMLElement>("[data-polis-focus-fallback]")?.focus();
}
