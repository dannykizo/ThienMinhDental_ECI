'use client';

import { Archive, Building2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { EmptyState, LoadingState, Notice, Pagination, StatusBadge } from '@/components/admin-ui';
import { useActionDialog } from '@/components/use-action-dialog';
import { apiRequest } from '@/lib/auth-api';
import { type CatalogImpact, type CatalogItem, type CatalogKind, describeCatalogImpact } from '@/lib/organization-api';
import { useClientPagination } from '@/lib/use-client-pagination';

type Perform = (action: () => Promise<unknown>, message: string) => Promise<boolean>;
const labels = { branches: 'Chi nhánh', departments: 'Phòng ban', positions: 'Chức vụ' };

export function OrganizationCatalog({ saving, version, perform, onPreparingChange }: { saving: boolean; version: number; perform: Perform; onPreparingChange: (value: boolean)=>void }) {
  const [kind, setKind] = useState<Exclude<CatalogKind,'teams'>>('branches');
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const { request, dialog } = useActionDialog();
  useEffect(() => {
    let active = true;
    apiRequest<CatalogItem[]>(`/organization/catalog/${kind}`)
      .then(rows => { if (active) { setItems(rows); setError(''); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Không tải được danh mục.'); });
    return () => { active=false; };
  }, [kind,retry,version]);
  const matches = (items ?? []).filter(item => (status==='ALL' || item.isActive === (status==='ACTIVE')) &&
    `${item.code} ${item.name}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const pagination = useClientPagination(matches,15);
  const disabled = saving || working;

  async function act(operation: () => Promise<void>) {
    if (busy.current || saving) return;
    busy.current=true; setWorking(true); onPreparingChange(true); setError('');
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xử lý danh mục.'); }
    finally { busy.current=false; setWorking(false); onPreparingChange(false); }
  }

  async function confirm(item: CatalogItem, action: 'DELETE' | 'DEACTIVATE' | 'REACTIVATE' | 'UPDATE') {
    const impact = await apiRequest<CatalogImpact>(`/organization/catalog/${kind}/${item.id}/impact`);
    if (action==='DELETE' && !impact.canDelete) {
      throw new Error('Danh mục đã từng được sử dụng. Hãy ngừng sử dụng thay vì xóa để giữ lịch sử.');
    }
    const title = { DELETE: 'Xóa vĩnh viễn', DEACTIVATE: 'Ngừng sử dụng', REACTIVATE: 'Khôi phục', UPDATE: 'Lưu thay đổi' }[action];
    const reason = await request({ title: `${title} ${labels[kind].toLowerCase()}`, confirmLabel: title,
      description: `${impact.item.code} · ${impact.item.name}. ${describeCatalogImpact(impact)} ${action==='DELETE' ? 'Xóa không thể khôi phục bản ghi; audit quyết định vẫn giữ.' : ''}`,
      fieldLabel: 'Lý do', required: true, minLength: 5, danger: action==='DELETE' || action==='DEACTIVATE' });
    return reason===null ? null : { reason, confirmationToken: impact.confirmationToken };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const target = editing;
    const code = String(fields.get('code') ?? '').trim();
    const name = String(fields.get('name') ?? '').trim();
    await act(async () => {
      const decision = target ? await confirm(target,'UPDATE') : null;
      if (target && decision===null) return;
      const saved = await perform(() => apiRequest(`/organization/catalog/${kind}${target ? `/${target.id}` : ''}`, {
        method: target ? 'PATCH' : 'POST', body: JSON.stringify({ code,name,...(target ? { isActive: target.isActive,...decision } : {}) }),
      }), target ? 'Đã cập nhật danh mục và lưu lịch sử.' : 'Đã thêm danh mục.');
      if (saved) { setEditing(null); form.reset(); }
    });
  }

  async function change(item: CatalogItem, remove: boolean) {
    await act(async () => {
      const decision = await confirm(item,remove ? 'DELETE' : item.isActive ? 'DEACTIVATE' : 'REACTIVATE');
      if (!decision) return;
      await perform(() => apiRequest(`/organization/catalog/${kind}/${item.id}`, { method: remove ? 'DELETE' : 'PATCH',
        body: JSON.stringify(remove ? decision : { code: item.code,name: item.name,isActive: !item.isActive,...decision }),
      }), remove ? 'Đã xóa danh mục chưa sử dụng; giữ audit quyết định.' : item.isActive ? 'Đã ngừng sử dụng; giữ nguyên liên kết và lịch sử.' : 'Đã khôi phục danh mục.');
      setEditing(null);
    });
  }

  return <>
    <div className="organization-tabs" role="group" aria-label="Danh mục tổ chức">
      {(Object.keys(labels) as (keyof typeof labels)[]).map(value => <button key={value} type="button" disabled={disabled} aria-pressed={kind===value}
        className={kind===value ? 'primary-button' : 'secondary-button'} onClick={() => { setKind(value); setItems(null); setEditing(null); setError(''); setSearch(''); }}><Building2 size={16} />{labels[value]}</button>)}
    </div>
    <p className="scope-note">Chưa sử dụng: được xóa sau xác nhận. Đã sử dụng: ngừng/khôi phục, không xóa lịch sử. Danh mục ngừng sử dụng không được chọn cho phân công mới.</p>
    {error && <Notice kind="error">{error} <button type="button" className="table-action" disabled={disabled} onClick={() => setRetry(value=>value+1)}>Tải lại</button></Notice>}
    <details className="editor-panel" open={editing ? true : undefined} key={`${kind}-${editing?.id ?? 'new'}`}>
      <summary><Plus size={16} /> {editing ? `Sửa ${labels[kind].toLowerCase()}` : `Thêm ${labels[kind].toLowerCase()}`}</summary>
      <form className="form-grid" onSubmit={event=>void save(event)}><fieldset className="organization-fields" disabled={disabled}>
        <label>Mã<input name="code" required maxLength={30} defaultValue={editing?.code ?? ''} /></label>
        <label>Tên<input name="name" required maxLength={150} defaultValue={editing?.name ?? ''} /></label>
        <div className="form-actions"><button type="submit" className="primary-button">{disabled ? 'Đang xử lý…' : editing ? 'Lưu thay đổi' : 'Thêm mới'}</button>
          {editing && <button type="button" className="secondary-button" onClick={()=>setEditing(null)}>Hủy sửa</button>}</div>
      </fieldset></form>
    </details>
    <div className="organization-list-filters">
      <label><Search size={16} /> Tìm theo mã hoặc tên<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm danh mục…" /></label>
      <label>Trạng thái<select aria-label="Trạng thái danh mục" value={status} onChange={event=>setStatus(event.target.value)}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng sử dụng</option><option value="ALL">Tất cả</option></select></label>
    </div>
    {!items && !error && <LoadingState />}
    {items && (matches.length===0 ? <EmptyState title="Không có danh mục phù hợp" description="Thêm danh mục mới hoặc đổi bộ lọc để xem dữ liệu ngừng sử dụng." /> : <>
      <div className="table-wrap"><table><thead><tr><th>{labels[kind]}</th><th>Trạng thái</th><th>Sử dụng</th><th>Thao tác</th></tr></thead><tbody>
        {pagination.items.map(item => <tr key={item.id}><td><strong>{item.name}</strong><br /><small>{item.code}</small></td><td>{item.isActive ? <StatusBadge value="ACTIVE" /> : <span className="status-badge status-warning">Ngừng sử dụng</span>}</td><td>{item.everUsed ? 'Đã sử dụng · giữ lịch sử' : 'Chưa sử dụng'}</td><td>
          <div className="form-actions"><button className="table-action" disabled={disabled} type="button" onClick={()=>setEditing(item)}><Pencil size={14} /> Sửa</button>
            <button className="table-action" disabled={disabled} type="button" onClick={()=>void change(item,false)}>{item.isActive ? <Archive size={14} /> : <RotateCcw size={14} />}{item.isActive ? 'Ngừng sử dụng' : 'Khôi phục'}</button>
            <button className="table-action danger-action" disabled={disabled || item.everUsed} title={item.everUsed ? 'Đã sử dụng: chỉ được ngừng sử dụng' : 'Xóa vĩnh viễn danh mục chưa sử dụng'} type="button" onClick={()=>void change(item,true)}><Trash2 size={14} /> Xóa</button></div>
        </td></tr>)}
      </tbody></table></div><Pagination page={pagination.page} pageSize={pagination.pageSize} total={matches.length} onPageChange={pagination.setPage} />
    </>)}
    {dialog}
  </>;
}
