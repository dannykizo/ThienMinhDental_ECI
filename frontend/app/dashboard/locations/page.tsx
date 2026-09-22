'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  accuracyThresholdMeters: number;
  branchId: string | null;
  branchName: string | null;
  locationType: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  isActive: boolean;
}
interface Branch { id: string; name: string; code: string; }
interface AuditLog { id: string; action: string; actorName: string; createdAt: string; }

export default function LocationsPage() {
  const [items, setItems] = useState<Location[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [editing, setEditing] = useState<Location | null>(null);
  const [locationType, setLocationType] = useState<Location['locationType']>('OFFICE');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [locations, branchRows, auditRows] = await Promise.all([
      apiRequest<Location[]>('/office-locations'),
      apiRequest<Branch[]>('/employees/lookups/branches'),
      apiRequest<AuditLog[]>('/office-locations/history'),
    ]);
    setItems(locations);
    setBranches(branchRows);
    setHistory(auditRows);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(() => setError('Không thể tải cấu hình vị trí làm việc.')); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function edit(item: Location): void {
    setEditing(item);
    setLocationType(item.locationType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const branchId = String(form.get('branchId') ?? '');
    setError('');
    try {
      await apiRequest(editing ? `/office-locations/${editing.id}` : '/office-locations', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: form.get('name'), address: form.get('address'), locationType,
          branchId: branchId || null,
          latitude: Number(form.get('latitude')), longitude: Number(form.get('longitude')),
          radiusMeters: Number(form.get('radiusMeters')),
          accuracyThresholdMeters: Number(form.get('accuracyThresholdMeters')),
        }),
      });
      setEditing(null);
      setLocationType('OFFICE');
      setMessage(editing ? 'Đã cập nhật vị trí làm việc.' : 'Đã thêm vị trí làm việc.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu vị trí.'); }
  }

  async function toggle(item: Location): Promise<void> {
    try {
      await apiRequest(`/office-locations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) });
      setMessage(item.isActive ? 'Đã tạm ngưng vị trí.' : 'Đã kích hoạt vị trí.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể cập nhật vị trí.'); }
  }

  return (
    <div className="module-page">
      <PageHeader eyebrow="VỊ TRÍ & GEOFENCE" title="Vị trí làm việc" description="Quản lý hai văn phòng HCM/HN và địa điểm làm việc bên ngoài. Bán kính và sai số GPS không vượt quá 50 m." />
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section aria-label="Quy tắc vị trí" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 24 }}>
        <article className="metric-card"><p>Vị trí đã cấu hình</p><strong>{items?.length ?? 0}</strong><span>Không tạo tọa độ giả</span></article>
        <article className="metric-card"><p>Đang hoạt động</p><strong>{items?.filter((row) => row.isActive).length ?? 0}</strong><span>Dùng khi chấm công</span></article>
        <article className="metric-card"><p>Giới hạn GPS</p><strong>50 m</strong><span>Theo yêu cầu khách hàng</span></article>
      </section>

      <details className="editor-panel" open>
        <summary>{editing ? `Chỉnh sửa · ${editing.name}` : '+ Thêm vị trí làm việc'}</summary>
        <form className="form-grid" key={editing?.id ?? 'new'} onSubmit={save}>
          <label>Tên địa điểm<input defaultValue={editing?.name ?? ''} name="name" placeholder="VD: Văn phòng TP.HCM" required /></label>
          <label>Loại vị trí<select defaultValue={editing?.locationType ?? 'OFFICE'} name="locationType" onChange={(event) => setLocationType(event.target.value as Location['locationType'])}><option value="OFFICE">Văn phòng</option><option value="EXTERNAL_WORKPLACE">Địa điểm làm việc bên ngoài</option></select></label>
          <label>Chi nhánh<select defaultValue={editing?.branchId ?? ''} name="branchId" required={locationType === 'OFFICE'}><option value="">{locationType === 'OFFICE' ? 'Chọn chi nhánh' : 'Không gắn chi nhánh'}</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="span-2">Địa chỉ<input defaultValue={editing?.address ?? ''} name="address" placeholder="Nhập địa chỉ đã được khách hàng xác nhận" required /></label>
          <label>Vĩ độ<input defaultValue={editing?.latitude} name="latitude" placeholder="10.803..." required step="any" type="number" /></label>
          <label>Kinh độ<input defaultValue={editing?.longitude} name="longitude" placeholder="106.664..." required step="any" type="number" /></label>
          <label>Bán kính Geofence (m)<input defaultValue={editing?.radiusMeters ?? 50} min="1" max="50" name="radiusMeters" required type="number" /></label>
          <label>Ngưỡng sai số GPS (m)<input defaultValue={editing?.accuracyThresholdMeters ?? 50} min="1" max="50" name="accuracyThresholdMeters" required type="number" /></label>
          <button className="primary-button form-action span-2">{editing ? 'Lưu thay đổi' : 'Lưu vị trí'}</button>
          {editing && <button className="table-action span-2" onClick={() => { setEditing(null); setLocationType('OFFICE'); }} type="button">Hủy chỉnh sửa</button>}
        </form>
      </details>

      {items === null ? <LoadingState /> : items.length === 0 ? <EmptyState title="Chưa có tọa độ chính thức" description="Hãy nhập tọa độ HCM, HN và địa điểm bên ngoài sau khi khách hàng xác nhận. Hệ thống không dùng dữ liệu giả." /> : (
        <div className="card-list">{items.map((item) => <article className="list-card" key={item.id}>
          <div><h3>{item.name}</h3><p>{item.address}</p><small>{item.locationType === 'OFFICE' ? `Văn phòng · ${item.branchName ?? 'Chưa gắn chi nhánh'}` : 'Địa điểm bên ngoài'} · {item.latitude}, {item.longitude}</small></div>
          <div><StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} /><small>Bán kính {item.radiusMeters} m · Sai số ≤ {item.accuracyThresholdMeters} m</small><button className="table-action" onClick={() => edit(item)} type="button">Sửa</button><button className="table-action" onClick={() => void toggle(item)} type="button">{item.isActive ? 'Tạm ngưng' : 'Kích hoạt'}</button></div>
        </article>)}</div>
      )}

      <details className="editor-panel" style={{ marginTop: 24 }}><summary>Lịch sử cấu hình (chỉ Admin)</summary>
        {history.length === 0 ? <p>Chưa có thao tác cấu hình.</p> : <div className="card-list">{history.slice(0, 12).map((row) => <article className="list-card" key={row.id}><div><h3>{row.action}</h3><p>Vị trí làm việc</p></div><small>{row.actorName} · {formatDate(row.createdAt)}</small></article>)}</div>}
      </details>
    </div>
  );
}
