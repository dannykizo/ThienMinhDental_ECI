'use client';

import { Activity, BellRing, Database, History, KeyRound, Send } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, formatDate } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface Overview {
  activeSessions: number;
  loginAlertFailures24h: number;
  pushFailures: number;
  pushPending: number;
  openExplanations: number;
  pendingLeave: number;
  activeTrips: number;
  auditEvents24h: number;
  serverTime: string;
  uptimeSeconds: number;
  release: string;
  pendingMigrations: boolean;
  integrations: Record<string, boolean>;
}
interface AuditRow { id: string; resourceType: string; resourceId: string; action: string; actorName: string; createdAt: string; }

const cards = [
  { key: 'activeSessions', label: 'Phiên đang hoạt động', note: 'Phiên chưa thu hồi và còn hạn', icon: KeyRound },
  { key: 'loginAlertFailures24h', label: 'Cảnh báo đăng nhập lỗi', note: 'Trong 24 giờ gần nhất', icon: BellRing },
  { key: 'pushFailures', label: 'Push gửi lỗi', note: 'Cần kiểm tra cấu hình Firebase', icon: Send },
  { key: 'auditEvents24h', label: 'Thay đổi đã ghi audit', note: 'Trong 24 giờ gần nhất', icon: History },
] as const;

export default function OperationsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState('');

  async function loadAudit(resourceType = '', action = ''): Promise<void> {
    const params = new URLSearchParams({ limit: '100' });
    if (resourceType) params.set('resourceType', resourceType);
    if (action) params.set('action', action);
    setAudit(await apiRequest<AuditRow[]>(`/operations/audit?${params}`));
  }

  useEffect(() => {
    Promise.all([apiRequest<Overview>('/operations/overview'), apiRequest<AuditRow[]>('/operations/audit?limit=100')])
      .then(([value, auditRows]) => { setOverview(value); setAudit(auditRows); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Không thể tải trạng thái vận hành.'));
  }, []);

  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(''); setAudit(null);
    try { await loadAudit(String(form.get('resourceType') || '').trim().toUpperCase(), String(form.get('action') || '').trim().toUpperCase()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải nhật ký audit.'); }
  }

  return <div className="module-page">
    <PageHeader eyebrow="CR7 / VẬN HÀNH" title="Vận hành & bảo mật" description="Theo dõi sức khỏe tích hợp, lỗi gửi thông báo và nhật ký thay đổi tập trung. Chỉ Admin được truy cập." />
    {error && <Notice kind="error">{error}</Notice>}
    {!overview ? <LoadingState /> : <>
      <section className="metric-grid" aria-label="Chỉ số vận hành">
        {cards.map((card) => <div className="metric-card" key={card.key}><div className="metric-card-top"><p>{card.label}</p><card.icon className="metric-card-icon" size={20} /></div><strong>{overview[card.key]}</strong><span>{card.note}</span></div>)}
      </section>
      <section className="editor-panel">
        <h2><Activity size={19} /> Trạng thái phát hành</h2>
        <p>Release: <strong>{overview.release}</strong> · Uptime: {Math.floor(overview.uptimeSeconds / 60)} phút · Máy chủ: {formatDate(overview.serverTime)}</p>
        <Notice kind={overview.pendingMigrations ? 'error' : 'success'}>{overview.pendingMigrations ? 'Còn migration chưa chạy. Không nên mở hệ thống cho người dùng.' : 'Database đã đồng bộ migration.'}</Notice>
        <div className="table-wrap"><table><thead><tr><th>Tích hợp</th><th>Trạng thái</th></tr></thead><tbody>{Object.entries(overview.integrations).map(([name, ready]) => <tr key={name}><td>{name}</td><td>{ready ? 'Đã cấu hình' : 'Chưa cấu hình'}</td></tr>)}</tbody></table></div>
      </section>
    </>}
    <section className="editor-panel">
      <h2><Database size={19} /> Nhật ký thay đổi</h2>
      <form className="toolbar" onSubmit={filter}><label>Loại dữ liệu<input name="resourceType" placeholder="Ví dụ: EMPLOYEE" /></label><label>Hành động<input name="action" placeholder="Ví dụ: UPDATE" /></label><button className="secondary-button">Lọc nhật ký</button></form>
      {audit === null ? <LoadingState /> : audit.length === 0 ? <EmptyState title="Chưa có nhật ký phù hợp" description="Thử bỏ bớt điều kiện lọc." /> : <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Dữ liệu</th><th>Hành động</th><th>Người thực hiện</th><th>Mã tham chiếu</th></tr></thead><tbody>{audit.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.resourceType}</td><td>{row.action}</td><td>{row.actorName}</td><td><code>{row.resourceId.slice(0, 8)}</code></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
