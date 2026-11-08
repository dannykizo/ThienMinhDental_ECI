'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clock3,
  ShieldCheck,
  UserRound,
  X,
  FileCheck2,
  FileX2,
  Lock,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { formatDate } from '@/components/admin-ui';

export function WorkflowDrawer({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
  eyebrow = 'CHI TIẾT XỬ LÝ',
  className = '',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  eyebrow?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  const isBusy = useRef(busy);

  useEffect(() => {
    close.current = onClose;
    isBusy.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    const keyboard = (event: KeyboardEvent): void => {
      if (document.querySelector('.dialog-backdrop')) return;
      if (event.key === 'Escape' && !isBusy.current) {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]'
        ) ?? []),
      ].filter((node) => node.getClientRects().length > 0);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      className="workflow-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        className={`workflow-drawer ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="workflow-drawer-header">
          <div className="workflow-drawer-header-info">
            <span className="workflow-eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            type="button"
            className="workflow-drawer-close"
            aria-label="Đóng chi tiết"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-drawer-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function WorkflowSteps({
  leader,
  head,
  confirmed,
  confirmedAt,
  reviewed,
  reviewedAt,
  fallback,
  terminal,
  status,
  approvalStage,
}: {
  leader: string | null;
  head: string | null;
  confirmed: string | null;
  confirmedAt: string | null;
  reviewed: string | null;
  reviewedAt: string | null;
  fallback?: boolean;
  terminal: boolean;
  status?: string;
  approvalStage?: string | null;
}) {
  const isLeaderDone = Boolean(confirmedAt);
  const isLeaderActive = !confirmedAt && !terminal && (!approvalStage || approvalStage === 'LEADER_CONFIRMATION');
  const isLeaderRejected = terminal && status === 'REJECTED' && !confirmedAt;

  const isHeadDone = Boolean(reviewedAt && status !== 'REJECTED');
  const isHeadRejected = status === 'REJECTED' || (terminal && !reviewedAt && confirmedAt);
  const isHeadActive = !reviewedAt && !terminal && (confirmedAt !== null || approvalStage === 'HEAD_APPROVAL');

  return (
    <div className="workflow-timeline-container" aria-label="Tiến trình phê duyệt 2 bước">
      <div className="workflow-timeline-track">
        {/* Step 1: Leader */}
        <div
          className={`workflow-step-node ${
            isLeaderDone ? 'is-done' : isLeaderRejected ? 'is-rejected' : isLeaderActive ? 'is-active' : ''
          }`}
        >
          <div className="workflow-step-bullet">
            {isLeaderDone ? (
              <Check size={16} strokeWidth={2.6} />
            ) : isLeaderRejected ? (
              <X size={16} strokeWidth={2.4} />
            ) : (
              <UserRound size={16} strokeWidth={2.2} />
            )}
            {isLeaderActive && <span className="workflow-pulse-ring" aria-hidden="true" />}
          </div>
          <div className="workflow-step-content">
            <div className="workflow-step-header">
              <span className="workflow-step-tag">Bước 1 · Leader</span>
              <span
                className={`workflow-step-badge ${
                  isLeaderDone ? 'badge-success' : isLeaderRejected ? 'badge-danger' : isLeaderActive ? 'badge-active' : 'badge-idle'
                }`}
              >
                {isLeaderDone
                  ? 'Đã xác nhận'
                  : isLeaderRejected
                  ? 'Không ghi nhận'
                  : isLeaderActive
                  ? 'Đang chờ xác nhận'
                  : 'Chờ tuyến'}
              </span>
            </div>
            <strong className="workflow-step-name">{confirmed ?? leader ?? 'Chưa phân công'}</strong>
            <span className="workflow-step-time">
              {confirmedAt ? formatDate(confirmedAt) : terminal ? 'Đã dừng xử lý' : 'Đến lượt Leader xác nhận'}
            </span>
          </div>
        </div>

        {/* Dynamic Connector */}
        <div
          className={`workflow-step-connector ${
            isLeaderDone ? 'connector-done' : isLeaderActive ? 'connector-active' : ''
          }`}
          aria-hidden="true"
        >
          <div className="connector-line" />
        </div>

        {/* Step 2: Head / Admin */}
        <div
          className={`workflow-step-node ${
            isHeadDone ? 'is-done' : isHeadRejected ? 'is-rejected' : isHeadActive ? 'is-active' : ''
          }`}
        >
          <div className="workflow-step-bullet">
            {fallback ? (
              <ShieldCheck size={16} strokeWidth={2.4} />
            ) : isHeadDone ? (
              <Check size={16} strokeWidth={2.6} />
            ) : isHeadRejected ? (
              <X size={16} strokeWidth={2.4} />
            ) : (
              <Clock3 size={16} strokeWidth={2.2} />
            )}
            {isHeadActive && <span className="workflow-pulse-ring" aria-hidden="true" />}
          </div>
          <div className="workflow-step-content">
            <div className="workflow-step-header">
              <span className="workflow-step-tag">
                {fallback ? 'Bước 2 · Admin duyệt thay' : 'Bước 2 · Trưởng phòng'}
              </span>
              <span
                className={`workflow-step-badge ${
                  isHeadDone
                    ? 'badge-success'
                    : isHeadRejected
                    ? 'badge-danger'
                    : isHeadActive
                    ? 'badge-active'
                    : 'badge-idle'
                }`}
              >
                {isHeadDone
                  ? 'Đã duyệt đơn'
                  : isHeadRejected
                  ? 'Từ chối đơn'
                  : isHeadActive
                  ? fallback
                    ? 'Chờ Admin duyệt'
                    : 'Đang chờ duyệt'
                  : 'Chờ Bước 1'}
              </span>
            </div>
            <strong className="workflow-step-name">{reviewed ?? head ?? 'Chưa phân công'}</strong>
            <span className="workflow-step-time">
              {reviewedAt ? formatDate(reviewedAt) : terminal ? 'Đã dừng xử lý' : 'Quyết định phê duyệt cuối'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowMiniTimeline({
  confirmedAt,
  reviewedAt,
  status,
  stage,
}: {
  confirmedAt: string | null;
  reviewedAt: string | null;
  status: string;
  stage?: string | null;
}) {
  const isL1Done = Boolean(confirmedAt);
  const isL1Active = !confirmedAt && status === 'SUBMITTED' && (!stage || stage === 'LEADER_CONFIRMATION');
  const isL2Done = Boolean(reviewedAt && status !== 'REJECTED');
  const isL2Rejected = status === 'REJECTED';
  const isL2Active = Boolean(confirmedAt && status === 'SUBMITTED' && !reviewedAt);

  return (
    <div className="workflow-mini-timeline" title="Tiến trình phê duyệt: Leader → Trưởng phòng">
      <span
        className={`mini-dot ${isL1Done ? 'is-done' : isL1Active ? 'is-active' : ''}`}
        title={`Bước 1 - Leader: ${isL1Done ? 'Đã xác nhận' : isL1Active ? 'Đang chờ' : 'Chưa đến'}`}
      >
        {isL1Done ? <Check size={10} strokeWidth={3} /> : '1'}
      </span>
      <span className={`mini-line ${isL1Done ? 'is-done' : ''}`} />
      <span
        className={`mini-dot ${
          isL2Done ? 'is-done' : isL2Rejected ? 'is-rejected' : isL2Active ? 'is-active' : ''
        }`}
        title={`Bước 2 - Trưởng phòng: ${
          isL2Done ? 'Đã duyệt' : isL2Rejected ? 'Từ chối' : isL2Active ? 'Đang chờ duyệt' : 'Chưa đến'
        }`}
      >
        {isL2Done ? <Check size={10} strokeWidth={3} /> : isL2Rejected ? <X size={10} strokeWidth={3} /> : '2'}
      </span>
    </div>
  );
}

export interface WorkflowAudit {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  oldValue: unknown;
  newValue: unknown;
}

const actions: Record<string, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  SUBMIT: { label: 'Gửi đơn từ', tone: 'neutral' },
  WORKFLOW_START: { label: 'Khởi tạo luồng xử lý', tone: 'neutral' },
  LEADER_CONFIRM: { label: 'Leader xác nhận', tone: 'primary' },
  HEAD_REVIEW: { label: 'Trưởng phòng quyết định', tone: 'primary' },
  ADMIN_FALLBACK_REVIEW: { label: 'Admin duyệt thay', tone: 'warning' },
  REROUTE: { label: 'Thay đổi tuyến xử lý', tone: 'warning' },
  ROUTE_UPDATE: { label: 'Cập nhật tuyến mặc định', tone: 'warning' },
  CANCEL: { label: 'Hủy đơn', tone: 'danger' },
  APPROVE: { label: 'Duyệt đơn', tone: 'success' },
  REJECT: { label: 'Từ chối đơn', tone: 'danger' },
  RESPOND: { label: 'Nhân viên gửi phản hồi', tone: 'primary' },
};

function formatAuditDiff(oldVal: unknown, newVal: unknown): { label: string; from?: string; to?: string }[] {
  const diffs: { label: string; from?: string; to?: string }[] = [];
  if (typeof oldVal === 'object' && typeof newVal === 'object' && oldVal !== null && newVal !== null) {
    const o = oldVal as Record<string, unknown>;
    const n = newVal as Record<string, unknown>;
    if (o.status !== undefined || n.status !== undefined) {
      diffs.push({ label: 'Trạng thái', from: String(o.status ?? '—'), to: String(n.status ?? '—') });
    }
    if (o.approvalStage !== undefined || n.approvalStage !== undefined) {
      diffs.push({ label: 'Bước xử lý', from: String(o.approvalStage ?? '—'), to: String(n.approvalStage ?? '—') });
    }
    if (n.reviewNote || n.confirmationNote || n.adminOverrideReason) {
      const note = String(n.reviewNote ?? n.confirmationNote ?? n.adminOverrideReason);
      diffs.push({ label: 'Ghi chú / Lý do', to: note });
    }
  }
  return diffs;
}

export function WorkflowHistory({ entries }: { entries: WorkflowAudit[] }) {
  const [openRawId, setOpenRawId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="workflow-audit-empty">
        <Lock size={16} />
        <p>Chưa có lịch sử xử lý. Toàn bộ hành động phê duyệt sẽ được ghi vết kiểm toán bảo mật tại đây.</p>
      </div>
    );
  }

  return (
    <div className="workflow-audit-wrapper">
      <div className="workflow-audit-shield">
        <ShieldCheck size={16} className="text-emerald" />
        <span>Audit Trail Bảo Mật · Dữ liệu được ký số và ghi nhận bất biến</span>
      </div>

      <ol className="workflow-audit-timeline">
        {entries.map((entry) => {
          const conf = actions[entry.action] ?? { label: entry.action, tone: 'neutral' };
          const diffs = formatAuditDiff(entry.oldValue, entry.newValue);
          const isRawOpen = openRawId === entry.id;

          return (
            <li key={entry.id} className={`audit-item tone-${conf.tone}`}>
              <div className="audit-marker">
                <span className="audit-marker-dot" />
              </div>

              <div className="audit-box">
                <div className="audit-header">
                  <span className={`audit-badge badge-${conf.tone}`}>{conf.label}</span>
                  <span className="audit-timestamp">{formatDate(entry.createdAt)}</span>
                </div>

                <div className="audit-actor">
                  <UserRound size={14} className="text-muted" />
                  <strong>{entry.actorName}</strong>
                </div>

                {diffs.length > 0 && (
                  <div className="audit-diff-summary">
                    {diffs.map((d, i) => (
                      <div key={i} className="audit-diff-row">
                        <span className="diff-label">{d.label}:</span>
                        {d.from && <span className="diff-from">{d.from}</span>}
                        {d.from && <ArrowRight size={12} className="diff-arrow" />}
                        <span className="diff-to">{d.to}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="audit-toggle-raw"
                  onClick={() => setOpenRawId(isRawOpen ? null : entry.id)}
                  aria-expanded={isRawOpen}
                >
                  {isRawOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{isRawOpen ? 'Ẩn thông tin đối soát JSON' : 'Xem thông tin đối soát JSON'}</span>
                </button>

                {isRawOpen && (
                  <pre className="audit-raw-json">
                    {JSON.stringify({ before: entry.oldValue, after: entry.newValue }, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WorkflowQuickActionBox({
  canConfirm,
  canReview,
  canAdminReview,
  canReroute,
  busy,
  onAction,
  onReroute,
}: {
  canConfirm: boolean;
  canReview: boolean;
  canAdminReview: boolean;
  canReroute: boolean;
  busy: boolean;
  onAction: (action: 'CONFIRM' | 'APPROVED' | 'REJECTED', fallback: boolean, note: string) => Promise<void>;
  onReroute?: () => void;
}) {
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');

  if (!canConfirm && !canReview && !canAdminReview && !canReroute) {
    return null;
  }

  async function handleActionClick(action: 'CONFIRM' | 'APPROVED' | 'REJECTED', fallback: boolean) {
    setActionError('');
    const trimmed = note.trim();
    if ((fallback || action === 'REJECTED') && trimmed.length < 5) {
      setActionError(
        action === 'REJECTED'
          ? 'Vui lòng nhập lý do từ chối tối thiểu 5 ký tự để thông báo cho nhân viên.'
          : 'Thao tác Admin duyệt thay bắt buộc phải nhập lý do kiểm toán (tối thiểu 5 ký tự).'
      );
      return;
    }

    await onAction(action, fallback, trimmed);
    setNote('');
  }

  return (
    <div className="workflow-quick-action-box">
      <div className="quick-action-header">
        <div className="quick-action-title">
          <ShieldAlert size={16} className="text-brand" />
          <span>Thao tác phê duyệt 1 chạm</span>
        </div>
        <span className="quick-action-sub">
          {canAdminReview
            ? 'Quyền Admin dự phòng: Cần nhập lý do đối soát minh bạch'
            : canConfirm
            ? 'Xác nhận bước 1 và tự động chuyển giao tuyến Trưởng phòng'
            : 'Quyết định phê duyệt cuối cùng cho đơn này'}
        </span>
      </div>

      <div className="quick-action-form">
        <label className="quick-action-field">
          <span>Ghi chú / Lý do phê duyệt {(canAdminReview || canReview) && <small>(bắt buộc khi Từ chối hoặc Admin thao tác)</small>}</span>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (actionError) setActionError('');
            }}
            placeholder="Nhập ghi chú gửi nhân sự hoặc lý do phê duyệt/từ chối…"
            rows={2}
            disabled={busy}
          />
        </label>

        {actionError && <div className="quick-action-error">{actionError}</div>}

        <div className="quick-action-buttons">
          {canConfirm && (
            <button
              type="button"
              className="primary-button btn-confirm"
              disabled={busy}
              onClick={() => void handleActionClick('CONFIRM', false)}
            >
              <FileCheck2 size={16} />
              <span>Xác nhận & chuyển tiếp</span>
            </button>
          )}

          {canReview && (
            <>
              <button
                type="button"
                className="primary-button btn-approve"
                disabled={busy}
                onClick={() => void handleActionClick('APPROVED', false)}
              >
                <FileCheck2 size={16} />
                <span>Duyệt đơn</span>
              </button>
              <button
                type="button"
                className="danger-button btn-reject"
                disabled={busy}
                onClick={() => void handleActionClick('REJECTED', false)}
              >
                <FileX2 size={16} />
                <span>Từ chối</span>
              </button>
            </>
          )}

          {canAdminReview && (
            <>
              <button
                type="button"
                className="primary-button btn-admin-approve"
                disabled={busy}
                onClick={() => void handleActionClick('APPROVED', true)}
              >
                <ShieldCheck size={16} />
                <span>Admin duyệt thay</span>
              </button>
              <button
                type="button"
                className="danger-button btn-admin-reject"
                disabled={busy}
                onClick={() => void handleActionClick('REJECTED', true)}
              >
                <FileX2 size={16} />
                <span>Admin từ chối thay</span>
              </button>
            </>
          )}

          {canReroute && onReroute && (
            <button
              type="button"
              className="secondary-button btn-reroute"
              disabled={busy}
              onClick={onReroute}
            >
              <span>Đổi tuyến xử lý</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
