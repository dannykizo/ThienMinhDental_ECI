'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth-api';

interface Device {
  id: string; deviceName: string; fingerprint: string; status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  employeeCode: string; fullName: string; email: string; decisionReason: string | null;
}

export function AttendanceDevices() {
  const [items, setItems] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Device | null>(null);
  const [action, setAction] = useState<'APPROVE' | 'REVOKE'>('APPROVE');
  const [reason, setReason] = useState('');
  async function load() {
    setLoading(true); setLoadError('');
    try { setItems(await apiRequest<Device[]>('/attendance/devices')); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Không tải được thiết bị.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { let active = true;
    apiRequest<Device[]>('/attendance/devices').then(data => { if (active) setItems(data); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'Không tải được thiết bị.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function decide(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true); setNotice('');
    try {
      await apiRequest(`/attendance/devices/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ action, reason: reason.trim() }) });
      setSelected(null); setReason(''); await load();
      setNotice(action === 'APPROVE' ? 'Đã duyệt điện thoại chấm công.' : 'Đã thu hồi khóa điện thoại. Phiên đăng nhập không tự bị xóa; máy không còn được chấm công.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không đổi được thiết bị.'); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <header className="module-header"><div><h2>Thiết bị chấm công</h2><p>Thiết bị đầu tiên được tự gắn với tài khoản, không chờ duyệt. Mỗi tài khoản chỉ một điện thoại được chấm công; đổi máy/tạo lại khóa cần thu hồi khóa cũ và Admin đối chiếu nhân viên, mã khóa trước khi duyệt khóa mới. Yêu cầu đang chờ từ trước vẫn cần duyệt.</p></div>
      <button className="secondary-button" disabled={loading || busy} onClick={() => void load()}>Tải lại thiết bị</button></header>
    <p>Vân tay/khuôn mặt mạnh do điện thoại xác thực. Không lưu mẫu sinh trắc; không phải nhận diện khuôn mặt nhân viên hoặc chứng nhận GPS thật. Máy không hỗ trợ: nhân viên gửi giải trình để xử lý theo tuyến hiện có.</p>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Đang tải thiết bị…</p> : loadError ? <p role="alert">{loadError} Hãy tải lại danh sách trước khi quyết định thiết bị.</p> : items.length === 0 ? <p>Chưa có điện thoại được đăng ký. Nhân viên bấm Chấm công trên app đã cập nhật để gắn thiết bị đầu tiên.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Điện thoại / mã khóa</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {items.map(item => <tr key={item.id}><td>{item.employeeCode} · {item.fullName}<p>{item.email}</p></td><td>{item.deviceName}<p style={{overflowWrap:'anywhere'}}>{item.fingerprint}</p></td><td>{item.status === 'ACTIVE' ? 'Đang hoạt động' : item.status === 'PENDING' ? 'Chờ xác nhận' : 'Đã thu hồi'}<p>{item.decisionReason}</p></td><td>
        {item.status === 'PENDING' && <button className="table-action" disabled={busy} onClick={() => { setSelected(item); setAction('APPROVE'); setReason(''); }}>Duyệt thiết bị</button>}
        {item.status !== 'REVOKED' && <button className="table-action danger-action" disabled={busy} onClick={() => { setSelected(item); setAction('REVOKE'); setReason(''); }}>Thu hồi khóa</button>}
      </td></tr>)}
    </tbody></table></div>}
    {selected && <form className="module-form" onSubmit={event => void decide(event)}>
      <h3>{action === 'APPROVE' ? 'Xác nhận cấp quyền chấm công' : 'Xác nhận thu hồi khóa'}: {selected.fullName}</h3>
      <p>{selected.deviceName} · {selected.fingerprint}</p>
      <label>Lý do (ít nhất 5 ký tự)<textarea required minLength={5} maxLength={2000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="action-group"><button className="primary-button" disabled={busy || loading || !!loadError || reason.trim().length < 5}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setSelected(null)}>Hủy</button></div>
    </form>}
  </section>;
}
