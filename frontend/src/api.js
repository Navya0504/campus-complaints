const BASE = import.meta.env.VITE_API_URL;

export async function api(path, method = "GET", body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem("auth");
    location.reload();
  }
  if (!res.ok)
    throw new Error(typeof data.detail === "string" ? data.detail : "Request failed");
  return data;
}