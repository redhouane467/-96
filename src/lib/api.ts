const API = import.meta.env.VITE_API_URL || "/api";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const h = new Headers(options.headers);
  h.set("Content-Type", "application/json");

  // Fix: Check if localStorage is available (i.e., running in a browser environment)
  // to prevent errors during server-side rendering (SSR) or static site generation (SSG).
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem("wassli_token");
  }

  if (token) h.set("Authorization", `Bearer ${token}`);
  const r = await fetch(API + path, { ...options, headers: h });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "حدث خطأ في الاتصال بالخادم");
  return d;
}