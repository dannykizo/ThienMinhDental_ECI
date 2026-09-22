'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  accuracyThresholdMeters: number;
  isActive: boolean;
}

export default function LocationsPage() {
  const [items, setItems] = useState<Location[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    setItems(await apiRequest<Location[]>('/office-locations'));
  }

  useEffect(() => {
    apiRequest<Location[]>('/office-locations')
      .then(setItems)
      .catch(() => setError('Không thể tải vị trí văn phòng.'));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/office-locations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          address: form.get('address'),
          latitude: Number(form.get('latitude')),
          longitude: Number(form.get('longitude')),
          radiusMeters: Number(form.get('radiusMeters')),
          accuracyThresholdMeters: Number(form.get('accuracyThresholdMeters')),
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã lưu vị trí và cấu hình Geofence thành công.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể lưu vị trí.',
      );
    }
  }

  async function toggle(item: Location): Promise<void> {
    await apiRequest(`/office-locations/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    await load();
  }

  return (
    <div className="module-page">
      <PageHeader
        description="Cấu hình tọa độ GPS và bán kính Geofence hợp lệ để ghi nhận chấm công tại chi nhánh."
        eyebrow="VỊ TRÍ & GEOFENCE"
        title="Vị trí văn phòng / Chi nhánh"
      />

      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <details className="editor-panel" open>
        <summary>+ Thêm vị trí văn phòng / cơ sở mới</summary>
        <form className="form-grid" onSubmit={create}>
          <label>
            Tên địa điểm / Cơ sở
            <input
              name="name"
              placeholder="VD: Chi nhánh Tân Bình - Số 9A"
              required
            />
          </label>
          <label className="span-2">
            Địa chỉ chi tiết
            <input
              name="address"
              placeholder="Số 9A Phạm Cự Lượng, Phường 2, Q. Tân Bình, TP.HCM"
              required
            />
          </label>
          <label>
            Vĩ độ (Latitude)
            <input
              name="latitude"
              placeholder="10.803..."
              required
              step="any"
              type="number"
            />
          </label>
          <label>
            Kinh độ (Longitude)
            <input
              name="longitude"
              placeholder="106.664..."
              required
              step="any"
              type="number"
            />
          </label>
          <label>
            Bán kính Geofence (m)
            <input
              defaultValue="150"
              min="10"
              name="radiusMeters"
              required
              type="number"
            />
          </label>
          <label>
            Ngưỡng Accuracy tối đa (m)
            <input
              defaultValue="100"
              min="5"
              name="accuracyThresholdMeters"
              required
              type="number"
            />
          </label>
          <button className="primary-button form-action span-2">
            Lưu vị trí văn phòng
          </button>
        </form>
      </details>

      {items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          description="Chấm công tại văn phòng sẽ bị từ chối nếu chưa có vị trí hoạt động nào được cấu hình."
          title="Chưa cấu hình Geofence"
        />
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <article className="list-card" key={item.id}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>📍</span>
                  <h3 style={{ margin: 0 }}>{item.name}</h3>
                </div>
                <p style={{ marginTop: '6px' }}>{item.address}</p>
                <small style={{ fontFamily: 'monospace' }}>
                  Tọa độ: {item.latitude}, {item.longitude}
                </small>
              </div>

              <div>
                <StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} />
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    fontSize: '0.74rem',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  <span
                    style={{
                      background: 'var(--brand-primary-light)',
                      color: 'var(--brand-primary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Bán kính {item.radiusMeters}m
                  </span>
                  <span
                    style={{
                      background: 'var(--canvas-subtle)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Accuracy ≤ {item.accuracyThresholdMeters}m
                  </span>
                </div>
                <button
                  className="table-action"
                  onClick={() => void toggle(item)}
                  type="button"
                >
                  {item.isActive ? 'Tạm tắt' : 'Kích hoạt'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
