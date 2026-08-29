import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { Role, User } from "../types";

const ROLE_META: Record<Role, { label: string; emoji: string }> = {
  customer: { label: "عميل", emoji: "👤" },
  courier: { label: "مندوب", emoji: "🛵" },
  admin: { label: "مدير", emoji: "👨‍💼" },
};

export default function Auth({
  role,
  onAuth,
  onBack,
}: {
  role: Role;
  onAuth: (u: User) => void;
  onBack: () => void;
}) {
  const canRegister = role !== "admin";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const meta = ROLE_META[role];
  const effectiveMode = canRegister ? mode : "login";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = effectiveMode === "register" ? { ...form, role } : form;
      const data = await api<any>(`/auth/${effectiveMode}`, { method: "POST", body: JSON.stringify(payload) });
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
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 text-sm flex items-center gap-1 hover:text-slate-600"
        >
          <span>›</span> رجوع لاختيار نوع الحساب
        </button>

        <div className="text-center">
          <img src="/icon-192.png" alt="وصلي" className="mx-auto w-16 h-16 rounded-2xl shadow" />
          <h1 className="text-3xl font-black mt-3">وصلي</h1>
          <p className="text-slate-500 flex items-center justify-center gap-1.5 mt-1">
            <span className="text-lg">{meta.emoji}</span>
            <span>
              {effectiveMode === "login" ? "تسجيل الدخول كـ" : "إنشاء حساب"} {meta.label}
            </span>
          </p>
        </div>

        {effectiveMode === "register" && (
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
          {loading ? "..." : effectiveMode === "login" ? "دخول" : "إنشاء حساب"}
        </button>

        {canRegister && (
          <button
            type="button"
            className="w-full text-green-700"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "ليس لديك حساب؟ إنشاء حساب" : "لديك حساب؟ تسجيل الدخول"}
          </button>
        )}
      </form>
    </main>
  );
}
