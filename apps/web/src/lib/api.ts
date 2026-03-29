import type { ApiResponse } from '@hamilton/shared';

const BASE_URL = '/api/v1';

// Token storage key
const ACCESS_TOKEN_KEY = 'hamilton_access_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const envelope: ApiResponse<T> = await response.json() as ApiResponse<T>;

  if (!response.ok || envelope.error) {
    const err = envelope.error;
    throw new ApiError(
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? 'An unexpected error occurred',
      err?.statusCode ?? response.status,
    );
  }

  return envelope;
}

export const api = {
  get<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
};
