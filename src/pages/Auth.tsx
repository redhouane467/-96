import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../types";

export default function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState<any>({ role: "customer" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<any>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("wassli_token", data.token);
      localStorage.setItem("wassli_user", JSON.stringify(data.user));
      onAuth(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-3xl shadow p-7 space-y-4">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-green-600 text-white flex items-center justify-center text-3xl">
            📍
          </div>
          <h1 className="text-3xl font-black mt-3">وصلي</h1>
          <p className="text-slate-500">توصيل سريع وبسيط</p>
        </div>

        {mode === "register" && (
          <>
            <input
              className="w-full border rounded-xl p-3"
              placeholder="الاسم"
              required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="w-full border rounded-xl p-3"
              placeholder="الهاتف"
              required
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <select
              className="w-full border rounded-xl p-3"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="customer">عميل</option>
              <option value="courier">مندوب</option>
            </select>
          </>
        )}

        <input
          className="w-full border rounded-xl p-3"
          type="email"
          placeholder="البريد"
          required
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="w-full border rounded-xl p-3"
          type="password"
          placeholder="كلمة المرور"
          minLength={6}
          required
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">{error}</div>}

        <button disabled={loading} className="w-full bg-green-600 text-white rounded-xl p-3 font-bold disabled:opacity-60">
          {loading ? "..." : mode === "login" ? "دخول" : "إنشاء حساب"}
        </button>
        <button
          type="button"
          className="w-full text-green-700"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "ليس لديك حساب؟ إنشاء حساب" : "لديك حساب؟ تسجيل الدخول"}
        </button>
      </form>
    </main>
  );
}
