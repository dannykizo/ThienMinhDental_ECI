'use client';

import {
  Crosshair,
  LocateFixed,
  MapPinned,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  ToastNotice,
  formatDate,
} from '@/components/admin-ui';
import {
  OfficeLocationMap,
  type MapLocation,
} from '@/components/office-location-map';
import { apiRequest } from '@/lib/auth-api';

interface Location extends MapLocation {
  accuracyThresholdMeters: number;
  branchId: string | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface AuditLog {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
}

const DEFAULT_RADIUS_METERS = 100;

export default function LocationsPage() {
  const [items, setItems] = useState<Location[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [editing, setEditing] = useState<Location | null>(null);
  const [locationType, setLocationType] =
    useState<Location['locationType']>('OFFICE');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [mapBranchId, setMapBranchId] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coordinateMessage, setCoordinateMessage] = useState('');
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
    const timer = window.setTimeout(() => {
      void load().catch(() =>
        setError('Không thể tải cấu hình vị trí làm việc.'),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const choosePoint = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(nextLatitude.toFixed(7));
    setLongitude(nextLongitude.toFixed(7));
    setCurrentAccuracy(null);
    setCoordinateMessage('Đã chọn tọa độ trên bản đồ. Kéo điểm màu cam để tinh chỉnh.');
  }, []);

  const beginEdit = useCallback((item: Location) => {
    setEditing(item);
    setLocationType(item.locationType);
    setLatitude(String(item.latitude));
    setLongitude(String(item.longitude));
    setRadiusMeters(item.radiusMeters);
    setCurrentAccuracy(null);
    setCoordinateMessage('Đang hiển thị vị trí đã lưu. Có thể kéo điểm màu cam để điều chỉnh.');
    setTimeout(() =>
      document
        .getElementById('location-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);

  const openLocationFromMap = useCallback(
    (id: string) => {
      const item = items?.find((location) => location.id === id);
      if (item) beginEdit(item);
    },
    [beginEdit, items],
  );

  function resetEditor(): void {
    setEditing(null);
    setLocationType('OFFICE');
    setLatitude('');
    setLongitude('');
    setRadiusMeters(DEFAULT_RADIUS_METERS);
    setCurrentAccuracy(null);
    setCoordinateMessage('');
  }

  function getCurrentPosition(): void {
    setError('');
    setCoordinateMessage('');
    if (!window.isSecureContext) {
      setError('Trình duyệt chỉ cho lấy vị trí trên HTTPS hoặc localhost.');
      return;
    }
    if (!navigator.geolocation) {
      setError('Thiết bị hoặc trình duyệt này không hỗ trợ lấy vị trí.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setCurrentAccuracy(Math.round(position.coords.accuracy));
        setCoordinateMessage(
          `Đã lấy một mẫu vị trí từ thiết bị · sai số khoảng ${Math.round(position.coords.accuracy)} m.`,
        );
        setLocating(false);
      },
      (geolocationError) => {
        const descriptions: Record<number, string> = {
          1: 'Bạn chưa cấp quyền vị trí cho trình duyệt.',
          2: 'Thiết bị chưa xác định được vị trí hiện tại.',
          3: 'Quá thời gian chờ lấy vị trí. Hãy thử lại ở nơi thoáng hơn.',
        };
        setError(
          descriptions[geolocationError.code] ??
            'Không thể lấy vị trí từ thiết bị.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const branchId = String(form.get('branchId') ?? '');
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (
      latitude === '' ||
      longitude === '' ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      setError('Hãy lấy vị trí thiết bị, chọn trên bản đồ hoặc nhập tọa độ hợp lệ.');
      return;
    }

    const wasEditing = editing !== null;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        editing ? `/office-locations/${editing.id}` : '/office-locations',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            address: form.get('address'),
            locationType,
            branchId: branchId || null,
            latitude: parsedLatitude,
            longitude: parsedLongitude,
            radiusMeters,
            accuracyThresholdMeters: Number(
              form.get('accuracyThresholdMeters'),
            ),
          }),
        },
      );
      formElement.reset();
      resetEditor();
      setMessage(
        wasEditing
          ? 'Đã cập nhật vị trí làm việc.'
          : 'Đã thêm vị trí làm việc.',
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể lưu vị trí.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: Location): Promise<void> {
    setError('');
    try {
      await apiRequest(`/office-locations/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      setMessage(
        item.isActive ? 'Đã tạm ngưng vị trí.' : 'Đã kích hoạt vị trí.',
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể cập nhật vị trí.',
      );
    }
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  const selectedPoint =
    latitude !== '' &&
    longitude !== '' &&
    Number.isFinite(parsedLatitude) &&
    Number.isFinite(parsedLongitude) &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180
      ? { latitude: parsedLatitude, longitude: parsedLongitude }
      : null;
  const visibleLocations = (items ?? []).filter(
    (item) =>
      (showInactive || item.isActive) &&
      (!mapBranchId || item.branchId === mapBranchId),
  );

  return (
    <div className="module-page">
      <PageHeader
        description="Lấy tọa độ từ thiết bị, chọn trực tiếp trên bản đồ và quản lý vùng chấm công của từng chi nhánh."
        eyebrow="VỊ TRÍ & GEOFENCE"
        title="Vị trí làm việc"
      />
      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section className="location-metric-grid" aria-label="Quy tắc vị trí">
        <article className="metric-card">
          <p>Vị trí đã cấu hình</p>
          <strong>{items?.length ?? 0}</strong>
          <span>Văn phòng và địa điểm bên ngoài</span>
        </article>
        <article className="metric-card">
          <p>Đang hoạt động</p>
          <strong>{items?.filter((row) => row.isActive).length ?? 0}</strong>
          <span>Dùng khi chấm công</span>
        </article>
        <article className="metric-card">
          <p>Bán kính check-in</p>
          <strong>100 m</strong>
          <span>Tối đa theo phản hồi khách hàng</span>
        </article>
        <article className="metric-card">
          <p>Chất lượng GPS</p>
          <strong>≤ 50 m</strong>
          <span>Không bị trộn với bán kính check-in</span>
        </article>
      </section>

      <section className="map-panel">
        <div className="map-panel-heading">
          <div>
            <span className="summary-label">
              <MapPinned aria-hidden="true" size={17} /> Bản đồ chi nhánh
            </span>
            <p>Bấm marker để sửa vị trí; bấm chỗ trống để lấy tọa độ mới.</p>
          </div>
          <div className="map-filters">
            <label>
              Chi nhánh
              <select value={mapBranchId} onChange={(event) => setMapBranchId(event.target.value)}>
                <option value="">Tất cả</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="check-inline">
              <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
              Hiện vị trí tạm ngưng
            </label>
          </div>
        </div>
        <OfficeLocationMap
          locations={visibleLocations}
          onLocationOpen={openLocationFromMap}
          onPointSelect={choosePoint}
          selectedPoint={selectedPoint}
          selectedRadiusMeters={radiusMeters}
        />
        <div className="map-legend">
          <span><i className="legend-dot active-location" />Đang hoạt động</span>
          <span><i className="legend-dot inactive-location" />Tạm ngưng</span>
          <span><i className="legend-dot selected-location" />Tọa độ đang chọn</span>
        </div>
      </section>

      <details className="editor-panel" id="location-editor" open>
        <summary>
          <span className="summary-label">
            {editing ? <Pencil aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}
            {editing ? `Chỉnh sửa · ${editing.name}` : 'Thêm vị trí làm việc'}
          </span>
        </summary>
        <form className="form-grid" key={editing?.id ?? 'new'} onSubmit={save}>
          <label>
            Tên địa điểm
            <input defaultValue={editing?.name ?? ''} name="name" placeholder="VD: Văn phòng TP.HCM" required />
          </label>
          <label>
            Loại vị trí
            <select defaultValue={editing?.locationType ?? 'OFFICE'} name="locationType" onChange={(event) => setLocationType(event.target.value as Location['locationType'])}>
              <option value="OFFICE">Văn phòng</option>
              <option value="EXTERNAL_WORKPLACE">Địa điểm làm việc bên ngoài</option>
            </select>
          </label>
          <label>
            Chi nhánh
            <select defaultValue={editing?.branchId ?? ''} name="branchId" required={locationType === 'OFFICE'}>
              <option value="">{locationType === 'OFFICE' ? 'Chọn chi nhánh' : 'Không gắn chi nhánh'}</option>
              {branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="span-2">
            Địa chỉ
            <input defaultValue={editing?.address ?? ''} name="address" placeholder="Nhập địa chỉ đã được khách hàng xác nhận" required />
          </label>

          <div className="coordinate-actions span-2">
            <button className="secondary-button" disabled={locating} onClick={getCurrentPosition} type="button">
              <LocateFixed aria-hidden="true" size={17} />
              {locating ? 'Đang lấy vị trí…' : 'Lấy vị trí thiết bị này'}
            </button>
            <span>
              <Crosshair aria-hidden="true" size={15} />
              {coordinateMessage || 'Chỉ lấy một mẫu vị trí khi bạn bấm nút; không theo dõi liên tục.'}
            </span>
          </div>

          <label>
            Vĩ độ
            <input max="90" min="-90" name="latitude" onChange={(event) => { setLatitude(event.target.value); setCurrentAccuracy(null); }} placeholder="10.803..." required step="any" type="number" value={latitude} />
          </label>
          <label>
            Kinh độ
            <input max="180" min="-180" name="longitude" onChange={(event) => { setLongitude(event.target.value); setCurrentAccuracy(null); }} placeholder="106.664..." required step="any" type="number" value={longitude} />
          </label>
          <label>
            Bán kính Geofence (m)
            <input max="100" min="1" name="radiusMeters" onChange={(event) => setRadiusMeters(Number(event.target.value))} required type="number" value={radiusMeters} />
          </label>
          <label>
            Ngưỡng sai số GPS (m)
            <input defaultValue={editing?.accuracyThresholdMeters ?? 50} max="50" min="1" name="accuracyThresholdMeters" required type="number" />
          </label>
          {currentAccuracy !== null && currentAccuracy > 50 && (
            <div className="span-2">
              <Notice kind="info">Mẫu hiện tại có sai số khoảng {currentAccuracy} m, lớn hơn ngưỡng khuyến nghị 50 m. Có thể thử lại ở gần cửa sổ hoặc ngoài trời.</Notice>
            </div>
          )}
          <div className="form-actions span-2">
            {editing && <button className="secondary-button" onClick={resetEditor} type="button">Hủy chỉnh sửa</button>}
            <button className="primary-button" disabled={saving}>
              {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu vị trí'}
            </button>
          </div>
        </form>
      </details>

      {items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          description="Dùng nút lấy vị trí hoặc chọn trực tiếp trên bản đồ; hệ thống không tự tạo tọa độ giả."
          title="Chưa có tọa độ chính thức"
        />
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <article className="list-card" key={item.id}>
              <div>
                <h3>{item.name}</h3>
                <p>{item.address}</p>
                <small>
                  {item.locationType === 'OFFICE'
                    ? `Văn phòng · ${item.branchName ?? 'Chưa gắn chi nhánh'}`
                    : 'Địa điểm bên ngoài'}{' '}
                  · {item.latitude}, {item.longitude}
                </small>
              </div>
              <div>
                <StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} />
                <small>Bán kính {item.radiusMeters} m · Sai số ≤ {item.accuracyThresholdMeters} m</small>
                <div className="action-group">
                  <button className="table-action" onClick={() => beginEdit(item)} type="button">Sửa</button>
                  <button className="table-action" onClick={() => void toggle(item)} type="button">{item.isActive ? 'Tạm ngưng' : 'Kích hoạt'}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <details className="editor-panel" style={{ marginTop: 24 }}>
        <summary>Lịch sử cấu hình (chỉ Admin)</summary>
        {history.length === 0 ? (
          <p className="panel-empty-copy">Chưa có thao tác cấu hình.</p>
        ) : (
          <div className="card-list">
            {history.slice(0, 12).map((row) => (
              <article className="list-card" key={row.id}>
                <div><h3>{row.action}</h3><p>Vị trí làm việc</p></div>
                <small>{row.actorName} · {formatDate(row.createdAt)}</small>
              </article>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
