const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

let authToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isFormData) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
