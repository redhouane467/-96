import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../types";

type Mode = "choose" | "login" | "register";
type Role = "customer" | "courier" | "admin";

export default function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function chooseMode(next: "login" | "register") {
    setError("");
    setMode(next);
    setSelectedRole(null);
    setForm({});
  }

  function chooseRole(role: Role) {
    setError("");
    setSelectedRole(role);
    setForm((current: any) => ({ ...current, role }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedRole) {
      setError("اختر نوع الحساب أولاً");
      return;
    }
    if (mode === "register" && selectedRole === "admin") {
      setError("حساب المدير يتم إنشاؤه من الإدارة، اختر تسجيل الدخول");
      return;
    }
    setLoading(true);
    try {
      const data = await api<any>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("wassli_token", data.token);
      localStorage.setItem("wassli_user", JSON.stringify(data.user));
      onAuth(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  const roleTitle = selectedRole === "customer" ? "عميل" : selectedRole === "courier" ? "مندوب" : "مدير";

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-green-50 via-white to-green-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <div className="mx-auto w-28 h-28 rounded-[2rem] bg-green-600 shadow-xl flex items-center justify-center border-4 border-white overflow-hidden">
            <div className="text-white text-center leading-none">
              <div className="text-4xl">🏍️</div>
              <div className="text-2xl font-black mt-1">وصلي</div>
            </div>
          </div>
          <h1 className="text-4xl font-black text-green-700 mt-4">وصلي</h1>
          <p className="text-slate-600 mt-1">توصيل أسرع... أسهل... وأقرب</p>
        </div>

        {mode === "choose" && (
          <section className="bg-white rounded-3xl shadow-xl border border-green-100 p-6 space-y-4">
            <h2 className="text-xl font-black text-center text-slate-800">مرحباً بك في وصلي</h2>
            <p className="text-center text-slate-500">اختر ماذا تريد أن تفعل</p>
            <button onClick={() => chooseMode("login")} className="w-full bg-green-600 text-white rounded-2xl p-4 font-black text-lg shadow hover:bg-green-700">
              تسجيل الدخول
            </button>
            <button onClick={() => chooseMode("register")} className="w-full border-2 border-green-600 text-green-700 rounded-2xl p-4 font-black text-lg hover:bg-green-50">
              فتح حساب جديد
            </button>
          </section>
        )}

        {mode !== "choose" && !selectedRole && (
          <section className="bg-white rounded-3xl shadow-xl border border-green-100 p-6 space-y-4">
            <h2 className="text-xl font-black text-center">اختر نوع الحساب</h2>
            <p className="text-center text-slate-500">اختر الحساب المناسب للمتابعة</p>
            <button onClick={() => chooseRole("customer")} className="w-full rounded-2xl p-4 bg-green-50 border-2 border-green-200 text-green-800 text-right">
              <b className="text-lg">👤 عميل</b><div className="text-sm mt-1 text-slate-600">طلب توصيل ومتابعة طلباتك</div>
            </button>
            <button onClick={() => chooseRole("courier")} className="w-full rounded-2xl p-4 bg-green-50 border-2 border-green-200 text-green-800 text-right">
              <b className="text-lg">🏍️ مندوب</b><div className="text-sm mt-1 text-slate-600">استقبال الطلبات وتوصيلها</div>
            </button>
            <button onClick={() => chooseRole("admin")} className="w-full rounded-2xl p-4 bg-slate-50 border-2 border-slate-200 text-slate-800 text-right">
              <b className="text-lg">🛡️ مدير</b><div className="text-sm mt-1 text-slate-600">إدارة المنصة والطلبات والمستخدمين</div>
            </button>
            <button type="button" onClick={() => setMode("choose")} className="w-full text-slate-500 py-2">رجوع</button>
          </section>
        )}

        {mode !== "choose" && selectedRole && (
          <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl border border-green-100 p-6 space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-green-50 text-green-800 rounded-full px-4 py-2 font-bold">{selectedRole === "customer" ? "👤" : selectedRole === "courier" ? "🏍️" : "🛡️"} {roleTitle}</div>
              <h2 className="text-2xl font-black mt-3">{mode === "login" ? "تسجيل الدخول" : "فتح حساب جديد"}</h2>
            </div>

            {mode === "register" && (
              <>
                <input className="w-full border border-slate-200 rounded-2xl p-3 outline-none focus:border-green-500" placeholder="الاسم الكامل" required onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="w-full border border-slate-200 rounded-2xl p-3 outline-none focus:border-green-500" placeholder="رقم الهاتف" required onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </>
            )}

            <input className="w-full border border-slate-200 rounded-2xl p-3 outline-none focus:border-green-500" type="email" placeholder="البريد الإلكتروني" required onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full border border-slate-200 rounded-2xl p-3 outline-none focus:border-green-500" type="password" placeholder="كلمة المرور" minLength={6} required onChange={(e) => setForm({ ...form, password: e.target.value })} />

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3 rounded-2xl text-sm">{error}</div>}

            <button disabled={loading} className="w-full bg-green-600 text-white rounded-2xl p-3.5 font-black disabled:opacity-60 hover:bg-green-700">
              {loading ? "جارٍ المعالجة..." : mode === "login" ? "دخول إلى وصلي" : "إنشاء الحساب"}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedRole(null)} className="flex-1 border rounded-2xl p-3 text-slate-600">تغيير النوع</button>
              <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="flex-1 text-green-700 font-bold">
                {mode === "login" ? "فتح حساب" : "لدي حساب"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
