import { useEffect, useRef } from 'react';

/** Keyboard containment for the existing landing dialogs, without changing submission handlers. */
export function useModalFocus(open: boolean, onClose: () => void, suspendWhen?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(node => node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible');
    const frame = requestAnimationFrame(() => {
      const available = controls();
      (available.find(node => node.matches('input')) ?? available[0] ?? dialog).focus();
    });
    const keyboard = (event: KeyboardEvent) => {
      // A customization/order drawer can open above the catalogue. Its existing
      // keyboard handling keeps ownership until that child drawer is closed.
      if (suspendWhen && document.querySelector(suspendWhen)) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const list = controls();
      if (!list.length) { event.preventDefault(); dialog.focus(); return; }
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, suspendWhen]);
  return ref;
}
