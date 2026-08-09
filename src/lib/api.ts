export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    // no body
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `request failed (${res.status})`, res.status)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  // Raw binary upload (e.g. an avatar image, a message attachment) —
  // bypasses the JSON content-type default so the file's own MIME type
  // reaches the server. X-File-Name carries the original filename (a plain
  // Blob has no .name); routes that don't care about it just ignore the header.
  upload: <T>(path: string, file: File | Blob) =>
    request<T>(path, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, ...(file instanceof File ? { 'X-File-Name': file.name } : {}) },
    }),
}
