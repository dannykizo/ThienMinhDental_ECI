'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Users, RotateCcw } from 'lucide-react';
import { EmptyState, LoadingState, Notice, StatusBadge, formatDate } from '@/components/admin-ui';
import { useActionDialog } from '@/components/use-action-dialog';
import { apiRequest } from '@/lib/auth-api';

interface Target { id: string; name: string; targetType: 'TEAM' | 'DEPARTMENT'; }
interface Member { employeeId: string; employeeCode: string; employeeName: string; }
interface Preview { members: Member[]; rosterToken: string; targetName: string; }
interface Group {
  id: string; title: string; targetName: string; status: 'ISSUED' | 'REVOKED'; reason: string; decision: string;
  effectiveFrom: string; effectiveTo: string | null; issuedAt: string; revokedAt: string | null; revocationReason: string | null;
  selectedMembers: Member[]; receipts: { employeeId: string; readAt: string | null; acknowledgedAt: string | null }[];
}
interface History { id: string; action: string; actorName: string; createdAt: string; }
type Content = { actionType: string; title: string; reason: string; decision: string; effectiveFrom: string; effectiveTo: string | null; targetId: string; targetType: string; requestId: string };

export function DisciplinaryGroups({ onChanged }: { onChanged: () => Promise<void> }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [targetKey, setTargetKey] = useState('');
  const [actionType, setActionType] = useState('WARNING');
  const [preview, setPreview] = useState<(Preview & { content: Content }) | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ id: string; entries: History[] } | null>(null);
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const { request, dialog: actionDialog } = useActionDialog();

  async function load(): Promise<void> {
    const [rows, catalogs] = await Promise.all([apiRequest<Group[]>('/disciplinary-groups'), apiRequest<Target[]>('/disciplinary-groups/targets')]);
    setGroups(rows); setTargets(catalogs); setStale(false); setError('');
  }
  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<Group[]>('/disciplinary-groups'), apiRequest<Target[]>('/disciplinary-groups/targets')])
      .then(([rows, catalogs]) => { if (active) { setGroups(rows); setTargets(catalogs); } })
      .catch(() => { if (active) setError('Không thể tải quyết định tập thể.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);

  async function chooseMembers(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy.current || stale) return;
    const target = targets.find(item => `${item.targetType}:${item.id}` === targetKey);
    if (!target) return;
    const values = new FormData(event.currentTarget);
    busy.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const roster = await apiRequest<Preview>('/disciplinary-groups/preview', { method: 'POST', body: JSON.stringify({ targetType: target.targetType, targetId: target.id }) });
      setSelected(roster.members.map(member => member.employeeId));
      setPreview({ ...roster, content: { targetType: target.targetType, targetId: target.id, requestId: crypto.randomUUID(), actionType, title: String(values.get('title')), reason: String(values.get('reason')), decision: String(values.get('decision')), effectiveFrom: String(values.get('effectiveFrom')), effectiveTo: values.get('effectiveTo') ? String(values.get('effectiveTo')) : null } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách nhân sự.'); }
    finally { busy.current = false; setSaving(false); }
  }

  function closePreview(): void { if (!busy.current) { dialog.current?.close(); setPreview(null); } }

  async function issue(): Promise<void> {
    if (!preview || !selected.length || busy.current || stale) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await apiRequest('/disciplinary-groups', { method: 'POST', body: JSON.stringify({ ...preview.content, rosterToken: preview.rosterToken, employeeIds: selected }) });
      dialog.current?.close(); setPreview(null); form.current?.reset(); setTargetKey(''); setActionType('WARNING');
      await load(); await onChanged();
      setMessage(`Đã ban hành cho ${selected.length} nhân sự đã chọn. Mỗi người có thông báo riêng trong Hộp thư; push tùy cấu hình.`);
    } catch (caught) {
      dialog.current?.close(); setPreview(null); setStale(true);
      setError(caught instanceof Error ? caught.message : 'Chưa xác định được kết quả ban hành. Tải lại hồ sơ trước khi thao tác tiếp.');
    } finally { busy.current = false; setSaving(false); }
  }

  async function revoke(group: Group): Promise<void> {
    if (busy.current || stale) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const reason = await request({ title: 'Thu hồi quyết định tập thể', description: `Thu hồi “${group.title}” cho đúng ${group.selectedMembers.length} người trong danh sách ban đầu. Không áp dụng cho thành viên mới. Hồ sơ vẫn được lưu.`, fieldLabel: 'Lý do thu hồi', required: true, minLength: 5, confirmLabel: 'Thu hồi cả danh sách', danger: true });
      if (reason === null) return;
      await apiRequest(`/disciplinary-groups/${group.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
      await load(); await onChanged(); setMessage('Đã thu hồi cả danh sách ban đầu; gửi tin thu hồi cho tài khoản còn hoạt động.');
    } catch (caught) { setStale(true); setError(caught instanceof Error ? caught.message : 'Không thể xác định kết quả thu hồi.'); }
    finally { busy.current = false; setSaving(false); }
  }

  async function showHistory(id: string): Promise<void> {
    try { setHistory({ id, entries: await apiRequest<History[]>(`/disciplinary-groups/${id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử.'); }
  }

  return <section aria-label="Quyết định tập thể">
    {actionDialog}
    {error && <Notice kind="error">{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
    {(stale || (error && groups === null)) && <Notice kind="info">Không tự gửi lại thao tác. <button className="secondary-button" disabled={saving} onClick={() => void load().catch(() => setError('Chưa thể tải lại hồ sơ tập thể.'))} type="button">Tải lại hồ sơ tập thể</button></Notice>}
    <details className="editor-panel">
      <summary><span className="summary-label"><Users size={16} aria-hidden="true" /> Ban hành quyết định tập thể</span></summary>
      <form ref={form} onSubmit={chooseMembers}>
        <fieldset className="form-grid" disabled={saving || stale || groups === null || preview !== null} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <label>Team / phòng ban<select required value={targetKey} onChange={event => setTargetKey(event.target.value)}><option value="">Chọn tập thể</option>{targets.map(target => <option key={`${target.targetType}:${target.id}`} value={`${target.targetType}:${target.id}`}>{target.targetType === 'TEAM' ? 'Team' : 'Phòng'} · {target.name}</option>)}</select></label>
          <label>Hình thức<select value={actionType} onChange={event => setActionType(event.target.value)}><option value="WARNING">Cảnh cáo</option><option value="SUSPENSION">Đình chỉ</option><option value="DISCIPLINARY_ACTION">Xử lý vi phạm</option></select></label>
          <label>Ngày hiệu lực<input name="effectiveFrom" required type="date" /></label><label>{actionType === 'SUSPENSION' ? 'Đình chỉ đến hết ngày' : 'Ngày kết thúc (không bắt buộc)'}<input name="effectiveTo" required={actionType === 'SUSPENSION'} type="date" /></label>
          <label className="span-2">Tiêu đề quyết định<input name="title" required minLength={3} maxLength={200} /></label>
          <label className="span-2">Lý do / hành vi vi phạm<textarea name="reason" required minLength={5} maxLength={5000} rows={3} /></label>
          <label className="span-2">Nội dung xử lý<textarea name="decision" required minLength={3} maxLength={5000} rows={3} /></label>
          <button className="primary-button form-action">{saving ? 'Đang xử lý…' : 'Chọn nhân sự và xem trước'}</button>
        </fieldset>
      </form>
    </details>
    <dialog ref={dialog} className="action-dialog disciplinary-roster-dialog" aria-labelledby="disciplinary-roster-title" onCancel={event => { event.preventDefault(); closePreview(); }}>
      {preview && <><h2 id="disciplinary-roster-title">Chọn nhân sự · {preview.targetName}</h2>
        <p>Tất cả nhân sự đủ điều kiện được tích sẵn. Bỏ tick người ngoại lệ. Chỉ danh sách được chọn nhận quyết định.</p>
        <strong>{preview.content.title}</strong><p>{preview.content.reason}</p><p>{preview.content.decision}</p><p>Hiệu lực {preview.content.effectiveFrom}{preview.content.effectiveTo ? ` – ${preview.content.effectiveTo}` : ''}</p>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>{preview.members.map(member => <label key={member.employeeId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(member.employeeId)} onChange={event => setSelected(ids => event.target.checked ? [...ids, member.employeeId] : ids.filter(id => id !== member.employeeId))} />{member.employeeCode} · {member.employeeName}</label>)}</div>
        </fieldset>
        {!preview.members.length && <Notice kind="info">Không có nhân sự đang hoạt động với tài khoản hoạt động trong tập thể này.</Notice>}
        <p>Đã chọn {selected.length}/{preview.members.length} nhân sự</p>
        <div className="dialog-actions"><button className="secondary-button" disabled={saving} onClick={closePreview} type="button">Quay lại</button><button className="danger-button" disabled={saving || !selected.length} onClick={() => void issue()} type="button">{saving ? 'Đang ban hành…' : `Ban hành cho ${selected.length} người`}</button></div>
      </>}
    </dialog>
    <h2>Hồ sơ tập thể</h2>
    {groups === null ? (!error && <LoadingState />) : !groups.length ? <EmptyState title="Chưa có quyết định tập thể" description="Chọn team/phòng ban và bỏ tick ngoại lệ trước khi ban hành." /> : <div className="card-list">{groups.map(group => <article className="list-card" key={group.id}><div>
      <p className="mono">{group.targetName} · {group.selectedMembers.length} nhân sự đã chọn</p><h3>{group.title}</h3>
      <p><strong>Lý do:</strong> {group.reason}</p><p><strong>Xử lý:</strong> {group.decision}</p><small>Hiệu lực {group.effectiveFrom}{group.effectiveTo ? ` – ${group.effectiveTo}` : ''} · Ban hành {formatDate(group.issuedAt)}</small>
      {group.revocationReason && <p><strong>Đã thu hồi:</strong> {group.revocationReason} · {formatDate(group.revokedAt)}</p>}
      <details><summary>Danh sách ban đầu và xác nhận nhận tin</summary>{group.selectedMembers.map(member => { const receipt = group.receipts.find(item => item.employeeId === member.employeeId); return <p key={member.employeeId}>{member.employeeCode} · {member.employeeName} — {receipt ? receipt.acknowledgedAt ? `Đã xác nhận ${formatDate(receipt.acknowledgedAt)}` : receipt.readAt ? 'Đã đọc, chưa xác nhận' : 'Chưa đọc' : 'Hồ sơ cá nhân đã bị xóa theo quyền Admin'}</p>; })}</details>
      {history?.id === group.id && <div className="trip-history">{history.entries.map(entry => <small key={entry.id}>{formatDate(entry.createdAt)} · {entry.actorName} · {entry.action}</small>)}</div>}
    </div><div><StatusBadge value={group.status} />{group.status === 'ISSUED' && <button className="table-action danger-action" disabled={saving || stale} onClick={() => void revoke(group)} type="button"><RotateCcw size={13} aria-hidden="true" /> Thu hồi cả danh sách</button>}<button className="table-action" onClick={() => void showHistory(group.id)} type="button">Lịch sử tập thể</button></div></article>)}</div>}
  </section>;
}
