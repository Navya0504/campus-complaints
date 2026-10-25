const BASE = import.meta.env.VITE_API_URL;

export async function api(path, method = "GET", body, token) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. It may be waking up, please try again in a few seconds.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem("auth");
    location.reload();
  }
  if (!res.ok) {
    const d = data.detail;
    throw new Error(
      typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : "Request failed"
    );
  }
  return data;
}
