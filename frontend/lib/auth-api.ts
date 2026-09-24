export type RoleCode =
  | 'ADMIN'
  | 'CHIEF_ACCOUNTANT'
  | 'AREA_MANAGER'
  | 'MANAGER'
  | 'EMPLOYEE';

export interface SessionUser {
  id: string;
  email: string;
  employeeId: string | null;
  displayName: string;
  roles: RoleCode[];
}

interface SessionResponse {
  user: SessionUser;
}

export interface LoginSessionAudit {
  id: string;
  accountEmail: string;
  displayName: string;
  deviceName: string;
  clientType: 'WEB' | 'MOBILE';
  ipAddress: string | null;
  signedInAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  loginAlertStatus: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  loginAlertNote: string | null;
  isCurrent: boolean;
}

interface ErrorResponse {
  code?: string;
  message?: string | string[];
}

export const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  const body = (await response.json().catch(() => ({}))) as ErrorResponse;
  const message = Array.isArray(body.message)
    ? body.message.join(' ')
    : (body.message ?? 'Không thể kết nối với hệ thống.');
  throw new ApiError(message, response.status, body.code ?? 'REQUEST_FAILED');
}

let refreshRequest: Promise<boolean> | null = null;

async function refreshWebSession(): Promise<boolean> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const request = (): Promise<Response> => fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  let response = await request();
  if (response.status === 401 && (await refreshWebSession())) {
    response = await request();
  }
  return parseResponse<T>(response);
}

export async function login(
  email: string,
  password: string,
): Promise<SessionUser> {
  const deviceStorageKey = 'thien-minh-web-device-id';
  let deviceId = window.localStorage.getItem(deviceStorageKey);
  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(deviceStorageKey, deviceId);
  }
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      clientType: 'WEB',
      deviceId,
      deviceName: `${window.navigator.platform || 'Máy tính'} · Trình duyệt web`,
    }),
  });
  return (await parseResponse<SessionResponse>(response)).user;
}

export function getLoginSessions(): Promise<LoginSessionAudit[]> {
  return apiRequest<LoginSessionAudit[]>('/auth/admin/sessions');
}

export async function revokeLoginSession(sessionId: string): Promise<void> {
  await apiRequest<void>(`/auth/admin/sessions/${sessionId}/revoke`, {
    method: 'POST',
  });
}

export async function getAdminSession(): Promise<SessionUser> {
  return (await apiRequest<SessionResponse>('/auth/admin-session')).user;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}
