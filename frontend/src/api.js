const TOKEN_KEY = 'fitnessnote.accessToken';
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = tokenStore.get();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body instanceof URLSearchParams) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
  }
  let data;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok) {
    if (response.status === 401 && token && !path.startsWith('/auth/login')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('session-expired'));
    }
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? '입력한 값의 형식과 범위를 확인해 주세요.'
        : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}
