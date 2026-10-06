'use client';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

type Module = 'attendance' | 'business-trips' | 'reports' | 'announcements';
type Row = Record<string, string | number | boolean | string[] | null>;
interface Report { employees: Row[]; summary: { employeeCount:number;scheduledDays:number;totalWorkedMinutes:number;totalOvertimeMinutes:number;pendingLeaveCount:number;openExplanationCount:number } }
const modules: Record<Module,string>={attendance:'Chấm công','business-trips':'Công tác',reports:'Báo cáo',announcements:'Theo dõi thông báo'};
const columns:Record<Module,Array<[string,string]>>={
  attendance:[['fullName','Nhân viên'],['workDate','Ngày'],['checkedInAt','Giờ vào'],['checkedOutAt','Giờ ra'],['workedMinutes','Phút làm'],['overtimeMinutes','Phút OT'],['status','Trạng thái']],
  'business-trips':[['fullName','Nhân viên'],['code','Mã phiếu'],['siteName','Địa điểm'],['startAt','Bắt đầu'],['endAt','Kết thúc'],['participationStatus','Tham gia'],['status','Phiếu']],
  reports:[['fullName','Nhân viên'],['scheduledDays','Ngày theo lịch'],['presentDays','Hiện diện'],['leaveDays','Nghỉ phép'],['businessTripDays','Công tác'],['incompleteDays','Thiếu công'],['absentDays','Vắng'],['workedMinutes','Phút làm'],['overtimeMinutes','Phút OT']],
  announcements:[['fullName','Nhân viên'],['title','Thông báo'],['publishedAt','Ban hành'],['readAt','Đã đọc'],['acknowledgedAt','Đã xác nhận'],['requiresAcknowledgement','Cần xác nhận'],['status','Trạng thái']],
};
function cell(row:Row,key:string) {
  const value=row[key];
  if (value===null || value===undefined) return '—';
  if (typeof value==='boolean') return value?'Có':'Không';
  if (key.endsWith('At') && typeof value==='string') return formatDate(value);
  if (key==='status' || key==='participationStatus') return <StatusBadge value={String(value)} />;
  return String(value);
}
export default function ManagedModulesPage() {
  const [module,setModule]=useState<Module>('attendance');
  const [month,setMonth]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7));
  const [rows,setRows]=useState<Row[] | null>(null),[report,setReport]=useState<Report | null>(null);
  const [error,setError]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load() {
      try {
        const data=await apiRequest<Row[] | Report>(`/organization/managed/${module}${module==='attendance'||module==='reports'?`?month=${month}`:''}`);
        if (active) {setRows(Array.isArray(data)?data:data.employees);setReport(Array.isArray(data)?null:data);setError('');}
      } catch(caught) {if(active){setRows(null);setReport(null);setError(caught instanceof Error?caught.message:'Không tải được phạm vi quản lý.');}}
    }
    void load();
    const focus=()=>{setRows(null);setReport(null);setError('');void load();};
    window.addEventListener('focus',focus);
    return ()=>{active=false;window.removeEventListener('focus',focus);};
  },[module,month,revision]);
  function reload(){setRows(null);setReport(null);setError('');setRevision(r=>r+1);}
  const filtered=(rows??[]).filter(r=>`${r.employeeCode} ${r.fullName} ${r.code??''} ${r.title??''}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const safePage=Math.min(page,Math.max(1,Math.ceil(filtered.length/10)));
  return <><PageHeader eyebrow="QUẢN LÝ THEO PHẠM VI" title="Theo dõi vận hành" description="Chỉ nhân sự trong các grant còn hiệu lực. Không có quyền sửa công, quản trị phiếu, chốt kỳ hoặc xuất Excel." />
    <div className="toolbar"><label>Module<select value={module} onChange={e=>{setModule(e.target.value as Module);setRows(null);setReport(null);setError('');setPage(1);}}>{Object.entries(modules).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      {(module==='attendance'||module==='reports')&&<label>Tháng<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setRows(null);setReport(null);setPage(1);}} /></label>}
      <label>Tìm nhân viên / mã / tiêu đề<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} /></label><button className="secondary-button" onClick={reload} type="button">Tải lại quyền và dữ liệu</button></div>
    {error?<Notice kind="error">{error}</Notice>:rows===null?<LoadingState />:<>
      {report&&<Notice>{report.summary.employeeCount} nhân viên · {report.summary.scheduledDays} ngày theo lịch · {report.summary.totalWorkedMinutes} phút làm / {report.summary.totalOvertimeMinutes} phút OT · {report.summary.pendingLeaveCount} đơn phép và {report.summary.openExplanationCount} giải trình chưa xong (chỉ phạm vi của bạn).</Notice>}
      {filtered.length===0?<EmptyState title="Chưa có dữ liệu phù hợp" description="Đổi bộ lọc hoặc tháng. Báo cáo chỉ có ngày theo lịch đã cấu hình, không tự tạo số liệu." />:<><div className="table-wrap"><table><thead><tr><th>Mã NV</th>{columns[module].map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{filtered.slice((safePage-1)*10,safePage*10).map((row,index)=><tr key={`${row.id??row.employeeId}-${row.employeeId}-${row.workDate??index}`}><td>{row.employeeCode}</td>{columns[module].map(([key])=><td key={key}>{cell(row,key)}</td>)}</tr>)}</tbody></table></div><Pagination page={safePage} pageSize={10} total={filtered.length} onPageChange={setPage}/></>}
    </>}<Notice>Phiếu công tác chỉ hiển thị phần tham gia trong phạm vi; không lộ thành viên ngoài quyền. Thông báo chỉ theo dõi trạng thái nhận/đọc/xác nhận, không mở nội dung riêng tư hoặc điều khiển push.</Notice></>;
}
