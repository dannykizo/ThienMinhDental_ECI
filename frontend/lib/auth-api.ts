export type RoleCode = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

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
    return response.json() as Promise<T>;
  }

  const body = (await response.json().catch(() => ({}))) as ErrorResponse;
  const message = Array.isArray(body.message)
    ? body.message.join(' ')
    : (body.message ?? 'Không thể kết nối với hệ thống.');
  throw new ApiError(message, response.status, body.code ?? 'REQUEST_FAILED');
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  return parseResponse<T>(response);
}

export async function login(
  email: string,
  password: string,
): Promise<SessionUser> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await parseResponse<SessionResponse>(response)).user;
}

export async function getAdminSession(): Promise<SessionUser> {
  const response = await fetch(`${apiUrl}/auth/admin-session`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return (await parseResponse<SessionResponse>(response)).user;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new ApiError('Không thể đăng xuất.', response.status, 'LOGOUT_FAILED');
  }
}
