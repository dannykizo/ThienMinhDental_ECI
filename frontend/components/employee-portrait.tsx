'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, Check, Copy, ImagePlus, LoaderCircle, Trash2, UserRound, X } from 'lucide-react';
import { apiDownload, apiRequest } from '@/lib/auth-api';

export interface PortraitMetadata { employeeId: string; version: string; updatedAt: string; }
export interface PortraitDraft { preview: string; portrait: Blob; thumbnail: Blob; }

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Trình duyệt chưa tạo được ảnh. Thử ảnh khác.')), 'image/jpeg', quality));
}
export async function prepareEmployeePortrait(file: File): Promise<PortraitDraft> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) throw new Error('Chọn ảnh JPEG, PNG hoặc WebP, tối đa 8 MB.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error('Không đọc được ảnh. Thử ảnh JPEG, PNG hoặc WebP khác.'); });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Ảnh có độ phân giải quá lớn. Chọn ảnh nhỏ hơn 40 megapixel.');
    const canvas = document.createElement('canvas');
    // Fit, not destructive face cropping. The visual card uses object-fit only.
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh.');
    context.fillStyle = '#f1eeed'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let portrait = await toBlob(canvas, .88);
    if (portrait.size > 768 * 1024) portrait = await toBlob(canvas, .65);
    if (portrait.size > 768 * 1024) throw new Error('Ảnh vẫn quá lớn sau nén. Chọn ảnh đơn giản hoặc nhỏ hơn.');
    const thumb = document.createElement('canvas');
    const thumbScale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
    thumb.width = Math.max(1, Math.round(bitmap.width * thumbScale)); thumb.height = Math.max(1, Math.round(bitmap.height * thumbScale));
    const thumbContext = thumb.getContext('2d');
    if (!thumbContext) throw new Error('Không tạo được ảnh nhỏ.');
    thumbContext.fillStyle = '#f1eeed'; thumbContext.fillRect(0, 0, thumb.width, thumb.height); thumbContext.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
    const thumbnail = await toBlob(thumb, .8);
    if (thumbnail.size > 40 * 1024) throw new Error('Ảnh thu nhỏ quá lớn. Chọn ảnh khác.');
    return { portrait, thumbnail, preview: URL.createObjectURL(portrait) };
  } finally { bitmap.close(); }
}

export function PortraitImage({ employeeId, version, name, thumbnail = false, preview }: { employeeId: string; version?: string; name: string; thumbnail?: boolean; preview?: string }) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!thumbnail);
  const [image, setImage] = useState<{ key: string; url?: string; error?: boolean }>();
  const key = `${employeeId}:${version}:${thumbnail}`;
  useEffect(() => {
    if (!thumbnail || !version) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '80px' });
    if (wrapper.current) observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, [thumbnail, version]);
  useEffect(() => {
    if (!version || !visible || preview) return;
    let active = true, url: string | undefined;
    void apiDownload(`/employees/${employeeId}/portrait?size=${thumbnail ? 'thumbnail' : 'full'}&v=${encodeURIComponent(version)}`).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob); setImage({ key, url });
    }).catch(() => { if (active) setImage({ key, error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [employeeId, version, thumbnail, visible, preview, key]);
  const source = preview ?? (image?.key === key ? image.url : undefined);
  return <span ref={wrapper} className={`ep-photo-image${source ? ' has-image' : ''}`}>
    {source ? <Image unoptimized src={source} alt={`Ảnh hồ sơ ${name}`} fill sizes={thumbnail ? '44px' : '(max-width:600px) 90vw, 320px'} onError={() => setImage({ key, error: true })} /> : thumbnail ? <span aria-hidden="true">{name.trim().split(/\s+/).slice(-2).map(part => part.replace(/[^\p{L}]/gu, '')[0]).join('').toLocaleUpperCase('vi')}</span> : <><UserRound size={104} strokeWidth={.65} aria-hidden="true" /><span>{version ? image?.error ? 'Chưa tải được ảnh' : 'Đang tải ảnh hồ sơ…' : 'Chưa có ảnh chân dung'}</span></>}
  </span>;
}

export function PortraitCard({ employeeId, name, code, position, active, version, draft, busy, onChoose, onSave, onCancel, onRemove, onEdit }: {
  employeeId: string; name: string; code: string; position: string; active: boolean; version?: string;
  draft: PortraitDraft | null; busy: boolean; onChoose: (file: File) => void; onSave: () => void; onCancel: () => void; onRemove: () => void; onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false), [copyError, setCopyError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null), copyAlive = useRef(true), copyLock = useRef(false);
  useEffect(() => {
    copyAlive.current = true;
    return () => { copyAlive.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);
  const handleCopyCode = async () => {
    if (copyLock.current || busy) return;
    copyLock.current = true; setCopyBusy(true); setCopied(false); setCopyError('');
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(code);
      if (!copyAlive.current) return;
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      if (copyAlive.current) setCopyError('Chưa sao chép được mã. Hãy thử lại hoặc chép mã trong phần chi tiết hồ sơ.');
    } finally {
      copyLock.current = false;
      if (copyAlive.current) setCopyBusy(false);
    }
  };

  return <article className="ep-portrait-card" aria-label="Chân dung nhân viên"><PortraitImage employeeId={employeeId} version={version} name={name} preview={draft?.preview} />
    <div className="ep-portrait-top">
      <span className={`ep-person-state${active ? '' : ' is-inactive'}`}><i />{active ? 'Hồ sơ hoạt động' : 'Ngừng hoạt động'}</span>
      <button type="button" className={`ep-code-badge${copied ? ' is-copied' : ''}`} onClick={() => void handleCopyCode()} disabled={busy || copyBusy} aria-busy={copyBusy} title="Sao chép mã nhân viên" aria-label={`Sao chép mã nhân viên ${code}`}>
        <span>{code}</span>
        {copyBusy ? <LoaderCircle size={11} aria-hidden="true" /> : copied ? <Check size={11} className="ep-copy-check" aria-hidden="true" /> : <Copy size={11} className="ep-copy-icon" aria-hidden="true" />}
      </button>
    </div>
    <span className="ep-visually-hidden" role="status">{copied ? 'Đã sao chép mã nhân viên.' : ''}</span>
    {copyError && <p className="ep-portrait-copy-error" role="alert">{copyError}</p>}
    <div className="ep-portrait-caption"><small>{draft ? 'XEM TRƯỚC · CHƯA LƯU' : 'THIÊN MINH / NHÂN SỰ'}</small><h3>{name}</h3><p>{position}</p><div className="ep-portrait-tools">
      {draft ? <><button type="button" disabled={busy} className="ep-photo-save" onClick={onSave}>{busy ? <LoaderCircle size={15} /> : <Camera size={15} />}Lưu ảnh</button><button type="button" disabled={busy} aria-label="Hủy ảnh xem trước" onClick={onCancel}><X size={16} /></button></> : <><label className={`ep-photo-choose${busy ? ' is-busy' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh chân dung nhân viên" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) onChoose(file); }} />{busy ? <LoaderCircle size={15} /> : <ImagePlus size={15} />}{version ? 'Thay ảnh' : 'Thêm ảnh'}</label>{version && <button type="button" disabled={busy} aria-label="Gỡ ảnh chân dung" onClick={onRemove}><Trash2 size={15} /></button>}<button type="button" disabled={busy} aria-label="Sửa thông tin nhân viên" onClick={onEdit}><ArrowUpRight size={17} /></button></>}
    </div></div>
  </article>;
}

export async function saveEmployeePortrait(employeeId: string, version: string | undefined, draft: PortraitDraft): Promise<{ version: string }> {
  const form = new FormData(); form.append('expectedVersion', version ?? 'none');
  form.append('portrait', draft.portrait, 'portrait.jpg'); form.append('thumbnail', draft.thumbnail, 'thumbnail.jpg');
  return apiRequest(`/employees/${employeeId}/portrait`, { method: 'POST', body: form });
}
