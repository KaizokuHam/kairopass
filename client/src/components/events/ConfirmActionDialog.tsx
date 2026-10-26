import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmActionDialog({ title, children, confirmLabel, pending, blocked = false, danger = false, close, confirm }: {
  title: string; children: ReactNode; confirmLabel: string; pending: boolean; blocked?: boolean; danger?: boolean; close: () => void; confirm: () => void;
}) {
  const titleId = useId(); const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null); const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById('root'); const oldInert = root?.getAttribute('inert');
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', ''); back.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      if (root) { if (oldInert === null || oldInert === undefined) root.removeAttribute('inert'); else root.setAttribute('inert', oldInert); }
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); else document.getElementById('main')?.focus();
    };
  }, []);
  useEffect(() => {
    if (pending) dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending) close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [pending, close]);
  return createPortal(<div className="event-dialog-backdrop"><div ref={dialog} className="event-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} aria-busy={pending}>
    <p className="eyebrow">{danger ? 'TAKE A MOMENT' : 'READY FOR WHAT’S NEXT'}</p><h2 id={titleId}>{title}</h2><div id={descriptionId}>{children}</div>
    <div className="event-dialog-actions"><Button ref={back} variant="ghost" disabled={pending} onClick={close}>{danger ? 'Keep event' : 'Keep editing'}</Button>
      <Button className={danger ? 'button-danger' : ''} disabled={pending || blocked} onClick={confirm}>{pending ? <><LoaderCircle size={15} className="spin" />Confirming…</> : confirmLabel}</Button></div>
  </div></div>, document.body);
}
