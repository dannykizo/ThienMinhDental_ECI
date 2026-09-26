'use client';

import { AlertTriangle, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

interface ActionDialogOptions {
  title: string;
  description: string;
  confirmLabel: string;
  fieldLabel?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  danger?: boolean;
}

interface PendingDialog extends ActionDialogOptions {
  resolve: (value: string | null) => void;
}

export function useActionDialog() {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<PendingDialog | null>(null);

  const request = useCallback((options: ActionDialogOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setValue('');
      const next = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const close = useCallback((result: string | null) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    current.resolve(result);
    setPending(null);
    window.queueMicrotask(() => previousFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!pending) return;
    (fieldRef.current ?? confirmRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, textarea')].filter((element) => !element.hasAttribute('disabled'));
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, pending]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalized = value.trim();
    if (pending?.required && normalized.length < (pending.minLength ?? 1)) return;
    close(normalized);
  }

  const dialog = pending ? <div className="dialog-backdrop" onMouseDown={() => close(null)}>
    <section aria-describedby="action-dialog-description" aria-labelledby="action-dialog-title" aria-modal="true" className="action-dialog" onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog">
      <div className={pending.danger ? 'dialog-icon danger' : 'dialog-icon'} aria-hidden="true"><AlertTriangle size={22} /></div>
      <button aria-label="Đóng hộp thoại" className="dialog-close" onClick={() => close(null)} type="button"><X size={18} /></button>
      <h2 id="action-dialog-title">{pending.title}</h2>
      <p id="action-dialog-description">{pending.description}</p>
      <form onSubmit={submit}>
        {pending.fieldLabel && <label>{pending.fieldLabel}<textarea ref={fieldRef} value={value} onChange={(event) => setValue(event.target.value)} minLength={pending.minLength} required={pending.required} placeholder={pending.placeholder} /></label>}
        <div className="dialog-actions"><button className="secondary-button" onClick={() => close(null)} type="button">Quay lại</button><button className={pending.danger ? 'danger-button' : 'primary-button'} ref={confirmRef} type="submit">{pending.confirmLabel}</button></div>
      </form>
    </section>
  </div> : null;

  return { request, dialog };
}
