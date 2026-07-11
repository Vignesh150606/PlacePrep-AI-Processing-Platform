import * as React from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
}

/**
 * NEW (Sprint 1A): shared focus-trap / Escape-to-close / body-scroll-lock
 * contract for hand-rolled, edge-anchored dialog surfaces (slide-in panels,
 * bottom sheets) that intentionally don't go through Radix Dialog — see the
 * existing note on MobileNav for why (Radix Dialog centers by default and
 * has no first-class "slide from an edge" mode).
 *
 * This is a fresh extraction, not a refactor of pre-existing logic: at the
 * start of this pass MobileNav only closed on outside-click or route change
 * — no focus trap, no Escape handling, and no scroll lock. Rather than give
 * the new mobile quiz palette sheet the full contract while leaving the
 * panel it was modeled on without it, this hook is applied to both, plus
 * MobileNav itself, so all three edge-anchored surfaces share one
 * implementation instead of three subtly different ones.
 *
 * Radix-based dialogs (ui/dialog.tsx, the command palette) already get
 * this behavior for free from @radix-ui/react-dialog and don't need it.
 */
export function useDialogA11y({ open, onClose }: UseDialogA11yOptions) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  // Capture the trigger, lock body scroll, and move focus into the panel.
  React.useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Deferred one tick so the panel's contents are mounted before we look
    // for something focusable inside it.
    const focusTimeout = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? container).focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimeout);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  // Escape-to-close + Tab focus trap.
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return { containerRef };
}
