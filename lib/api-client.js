// Fetch wrapper for the app's own API routes. The session cookie is sent automatically;
// failures throw ApiError carrying the server's message, code and HTTP status.
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: isForm || options.body === undefined ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : isForm ? options.body : JSON.stringify(options.body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    // New routes send { error: { code, message } }; the legacy catch-all sends { error: 'text' }.
    const message = typeof err === 'string' ? err : err?.message || `Request failed (${res.status})`;
    const e = new ApiError(message, res.status, typeof err === 'object' ? err?.code : undefined);
    e.data = data;
    throw e;
  }
  return data;
}

// Upload with progress (fetch can't report upload progress). Resolves like api().
export function uploadWithProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const e = new ApiError(data?.error?.message || `Upload failed (${xhr.status})`, xhr.status, data?.error?.code);
      e.data = data;
      reject(e);
    };
    xhr.onerror = () => reject(new ApiError('The upload was interrupted. Check your connection and try again.', 0, 'NETWORK'));
    xhr.send(formData);
  });
}
