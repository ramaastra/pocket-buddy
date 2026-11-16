export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const apiURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
export async function apiRequest<T>(path: string, body?: unknown, csrfToken?: string, method = 'POST'): Promise<T> {
  const response = await fetch(`${apiURL}/api${path}`, {
    method: body === undefined ? 'GET' : method, credentials: 'include',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ApiError(typeof result.error === 'string' ? result.error : 'Could not reach the server. Try again.', response.status, typeof result.code === 'string' ? result.code : undefined);
  }
  const bodyText = await response.text();
  return bodyText.trim() ? JSON.parse(bodyText) as T : undefined as T;
}

export async function apiUpload<T>(path: string, file: File, csrfToken: string): Promise<T> {
  const form = new FormData();
  form.append('image', file);
  const response = await fetch(`${apiURL}/api${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken }, body: form,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ApiError(typeof result.error === 'string' ? result.error : 'Could not reach the server. Try again.', response.status, typeof result.code === 'string' ? result.code : undefined);
  }
  return await response.json() as T;
}
