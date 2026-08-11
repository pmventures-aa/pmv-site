export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

function pause(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase()
  const attempts = method === 'GET' || method === 'HEAD' ? 2 : 1
  let res: Response | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      res = await fetch(`/api${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      })
    } catch (error) {
      if (attempt + 1 >= attempts) throw new ApiError('The service could not be reached. Check your connection and try again.', 0)
      await pause(300)
      continue
    }
    if (!RETRYABLE_STATUS.has(res.status) || attempt + 1 >= attempts) break
    await pause(300)
  }

  if (!res) throw new ApiError('The service could not be reached. Try again.', 0)
  let data: any = null
  try {
    data = await res.json()
  } catch {
    // no body
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `request failed (${res.status})`, res.status)
  }

  if (typeof window !== 'undefined' && method !== 'GET' && method !== 'HEAD') {
    // Let shared HQ chrome refresh notification/activity state immediately
    // after successful local mutations instead of waiting for the next poll.
    window.dispatchEvent(new Event('pmv:activity'))
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
  upload: <T>(path: string, file: File | Blob) =>
    request<T>(path, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, ...(file instanceof File ? { 'X-File-Name': file.name } : {}) },
    }),
}
