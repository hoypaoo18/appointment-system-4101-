import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export function AccessibleDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const background = [...document.body.children].filter(e => e instanceof HTMLElement && e !== root.current && !['SCRIPT','STYLE'].includes(e.tagName)) as HTMLElement[];
    const oldStates = background.map(e => ({e,inert:e.inert,hidden:e.getAttribute('aria-hidden')}));
    for (const e of background) {e.inert=true;e.setAttribute('aria-hidden','true');}
    const controls = () => [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])].filter(e => e.getBoundingClientRect().width > 0);
    (controls()[0] || root.current)?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); root.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); for(const state of oldStates){state.e.inert=state.inert;if(state.hidden===null)state.e.removeAttribute('aria-hidden');else state.e.setAttribute('aria-hidden',state.hidden);} if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="ui-dialog fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto [&>div.relative]:my-auto">{children}</div>,document.body);
}
