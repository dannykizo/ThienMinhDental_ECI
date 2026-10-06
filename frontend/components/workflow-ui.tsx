'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, ShieldCheck, UserRound, X } from 'lucide-react';
import { formatDate } from '@/components/admin-ui';

export function WorkflowDrawer({ title, subtitle, children, onClose, busy = false }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  const isBusy = useRef(busy);
  useEffect(() => { close.current = onClose; isBusy.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keyboard = (event: KeyboardEvent): void => {
      if (document.querySelector('.dialog-backdrop')) return;
      if (event.key === 'Escape' && !isBusy.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="workflow-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} className="workflow-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="workflow-drawer-header"><div><span className="workflow-eyebrow">CHI TIẾT XỬ LÝ</span><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div><button type="button" className="icon-button" aria-label="Đóng chi tiết" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <div className="workflow-drawer-body">{children}</div>
    </div>
  </div>, document.body);
}

export function WorkflowSteps({ leader, head, confirmed, confirmedAt, reviewed, reviewedAt, fallback, terminal }: { leader: string | null; head: string | null; confirmed: string | null; confirmedAt: string | null; reviewed: string | null; reviewedAt: string | null; fallback?: boolean; terminal: boolean }) {
  return <ol className="workflow-steps" aria-label="Tuyến và người xử lý">
    <li className={confirmedAt ? 'is-done' : ''}><span className="workflow-step-icon">{confirmedAt ? <Check size={16} /> : <UserRound size={16} />}</span><div><small>Leader xác nhận</small><strong>{confirmed ?? leader ?? 'Chưa phân công'}</strong><span>{confirmedAt ? formatDate(confirmedAt) : terminal ? 'Không có xác nhận được ghi nhận' : 'Chờ xác nhận'}</span></div></li>
    <li className={reviewedAt ? 'is-done' : ''}><span className="workflow-step-icon">{fallback ? <ShieldCheck size={16} /> : reviewedAt ? <Check size={16} /> : <Clock3 size={16} />}</span><div><small>{fallback ? 'Admin quyết định thay' : 'Trưởng phòng quyết định'}</small><strong>{reviewed ?? head ?? 'Chưa phân công'}</strong><span>{reviewedAt ? formatDate(reviewedAt) : terminal ? 'Không có quyết định được ghi nhận' : 'Chờ xử lý'}</span></div></li>
  </ol>;
}

export interface WorkflowAudit { id: string; action: string; actorName: string; createdAt: string; oldValue: unknown; newValue: unknown; }
const actions: Record<string, string> = { SUBMIT: 'Gửi đơn', WORKFLOW_START: 'Khởi tạo tuyến xử lý', LEADER_CONFIRM: 'Leader xác nhận', HEAD_REVIEW: 'Trưởng phòng quyết định', ADMIN_FALLBACK_REVIEW: 'Admin quyết định thay', REROUTE: 'Thay đổi tuyến', ROUTE_UPDATE: 'Cập nhật tuyến', CANCEL: 'Hủy đơn', APPROVE: 'Duyệt đơn', REJECT: 'Từ chối đơn', RESPOND: 'Nhân viên phản hồi' };
export function WorkflowHistory({ entries }: { entries: WorkflowAudit[] }) {
  return entries.length === 0 ? <p className="muted">Chưa có lịch sử xử lý theo luồng mới.</p> : <ol className="workflow-history">{entries.map(entry => <li key={entry.id}><span className="workflow-history-dot" /><div><strong>{actions[entry.action] ?? entry.action}</strong><p>{entry.actorName} · {formatDate(entry.createdAt)}</p><details><summary>Thông tin đối soát</summary><pre>{JSON.stringify({ before: entry.oldValue, after: entry.newValue }, null, 2)}</pre></details></div></li>)}</ol>;
}
