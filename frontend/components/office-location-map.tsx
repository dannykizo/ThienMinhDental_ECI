'use client';

import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/admin-ui';

export interface MapLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  branchName: string | null;
  locationType: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  isActive: boolean;
}

interface SelectedPoint {
  latitude: number;
  longitude: number;
}

interface OfficeLocationMapProps {
  locations: MapLocation[];
  selectedPoint: SelectedPoint | null;
  selectedRadiusMeters: number;
  onPointSelect: (latitude: number, longitude: number) => void;
  onLocationOpen: (id: string) => void;
}

const fallbackCenter: [number, number] = [16.2, 106.8];

export function OfficeLocationMap({
  locations,
  selectedPoint,
  selectedRadiusMeters,
  onPointSelect,
  onLocationOpen,
}: OfficeLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const onPointSelectRef = useRef(onPointSelect);
  const onLocationOpenRef = useRef(onLocationOpen);
  const fittedRef = useRef(false);
  const [readyVersion, setReadyVersion] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    onPointSelectRef.current = onPointSelect;
    onLocationOpenRef.current = onLocationOpen;
  }, [onLocationOpen, onPointSelect]);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    fittedRef.current = false;

    void import('leaflet').then((leaflet) => {
      if (disposed || !containerRef.current) return;
      leafletRef.current = leaflet;
      map = leaflet.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(fallbackCenter, 5);
      mapRef.current = map;
      layersRef.current = leaflet.layerGroup().addTo(map);

      const tiles = leaflet.tileLayer(
        process.env.NEXT_PUBLIC_MAP_TILE_URL ??
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution:
            process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      );
      let failed = false;
      const finishLoading = () => {
        if (disposed) return;
        clearTimeout(timeout);
        const loaded = containerRef.current?.querySelector('.leaflet-tile-loaded');
        setMapStatus(failed || !loaded ? 'error' : 'ready');
      };
      tiles.on('loading', () => {
        failed = false;
        if (!disposed) setMapStatus('loading');
        clearTimeout(timeout);
        timeout = setTimeout(() => { if (!disposed) setMapStatus('error'); }, 15000);
      });
      tiles.on('tileerror', () => {
        failed = true;
        if (!disposed) setMapStatus('error');
      });
      tiles.on('load', finishLoading);
      tiles.addTo(map);
      observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
      observer.observe(containerRef.current);

      map.on('click', (event) => {
        onPointSelectRef.current(event.latlng.lat, event.latlng.lng);
      });
      setReadyVersion((version) => version + 1);
    }).catch(() => { if (!disposed) setMapStatus('error'); });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      layersRef.current = null;
      leafletRef.current = null;
    };
  }, [retryVersion]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!leaflet || !map || !layers) return;

    layers.clearLayers();
    const bounds = leaflet.latLngBounds([]);

    for (const location of locations) {
      const point = leaflet.latLng(location.latitude, location.longitude);
      bounds.extend(point);
      const color = location.isActive ? '#5e2d91' : '#94a3b8';
      const coverage = leaflet.circle(point, {
        radius: location.radiusMeters,
        color,
        fillColor: color,
        fillOpacity: location.isActive ? 0.1 : 0.04,
        opacity: 0.65,
        weight: 1.5,
      });
      const marker = leaflet.circleMarker(point, {
        bubblingMouseEvents: false,
        radius: 8,
        color: '#ffffff',
        fillColor: color,
        fillOpacity: 1,
        opacity: 1,
        weight: 3,
      });
      const tooltip = document.createElement('div');
      tooltip.textContent = `${location.name} · ${location.branchName ?? 'Địa điểm dùng chung'} · ${location.radiusMeters} m`;
      marker.bindTooltip(tooltip, { direction: 'top' });
      marker.on('click', () => onLocationOpenRef.current(location.id));
      layers.addLayer(coverage);
      layers.addLayer(marker);
    }

    if (selectedPoint) {
      const point = leaflet.latLng(
        selectedPoint.latitude,
        selectedPoint.longitude,
      );
      const selectedIcon = leaflet.divIcon({
        className: 'selected-location-marker',
        html: '<span aria-hidden="true"></span>',
        iconAnchor: [14, 14],
        iconSize: [28, 28],
      });
      const marker = leaflet.marker(point, {
        draggable: true,
        autoPan: true,
        icon: selectedIcon,
        keyboard: true,
        title: 'Tọa độ đang chọn — kéo để điều chỉnh',
      });
      marker.on('dragend', () => {
        const movedPoint = marker.getLatLng();
        onPointSelectRef.current(movedPoint.lat, movedPoint.lng);
      });
      layers.addLayer(
        leaflet.circle(point, {
          radius: selectedRadiusMeters,
          color: '#f97316',
          fillColor: '#f97316',
          fillOpacity: 0.14,
          opacity: 0.9,
          weight: 2,
        }),
      );
      layers.addLayer(marker);
      map.flyTo(point, Math.max(map.getZoom(), 17), { duration: 0.45 });
      return;
    }

    if (!fittedRef.current && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
      fittedRef.current = true;
    }
  }, [locations, readyVersion, selectedPoint, selectedRadiusMeters]);

  return (
    <>
    {mapStatus === 'loading' && <p role="status">Đang tải ảnh nền bản đồ…</p>}
    {mapStatus === 'error' && (
      <Notice kind="error">
        Không tải được ảnh nền bản đồ. Tọa độ và cấu hình đã lưu vẫn được giữ nguyên;
        bạn vẫn có thể nhập tọa độ hoặc lấy vị trí thiết bị.
        {' '}<button className="secondary-button" type="button" onClick={() => { setMapStatus('loading'); setRetryVersion(version => version + 1); }}>Thử tải lại bản đồ</button>
      </Notice>
    )}
    <div
      aria-label="Bản đồ các vị trí làm việc. Bấm bản đồ để chọn tọa độ hoặc kéo điểm màu cam để điều chỉnh."
      className="office-location-map"
      ref={containerRef}
      role="application"
    />
    </>
  );
}
