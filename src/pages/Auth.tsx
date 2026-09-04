import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { Role, User } from "../types";

const ROLE_META: Record<Exclude<Role, "admin">, { label: string; emoji: string }> = {
  customer: { label: "عميل", emoji: "👤" },
  courier: { label: "مندوب", emoji: "🛵" },
};

export default function Auth({
  role,
  onAuth,
  onBack,
  initialMode = "login",
}: {
  role: Role | null;
  onAuth: (u: User) => void;
  onBack: () => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState<any>({});
  const [idCard, setIdCard] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canRegister = role !== null;
  const effectiveMode = canRegister ? mode : "login";

  const meta =
    role && role !== "admin"
      ? ROLE_META[role]
      : { label: "مستخدم", emoji: "🔐" };

  async function submit(e: FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      let payload: any;

      if (effectiveMode === "register") {
        payload = {
          name: form.name,
          phone: form.phone,
          password: form.password,
          role,
        };

        if (role === "courier" && idCard) {
          const base64 = await fileToBase64(idCard);
          payload.idCard = {
            data: base64,
            mime: idCard.type,
          };
        }
      } else {
        payload = {
          phone: form.phone,
          password: form.password,
        };
      }

      const data = await api<any>(
        `/auth/${effectiveMode}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      localStorage.setItem("wassli_token", data.token);
      localStorage.setItem(
        "wassli_user",
        JSON.stringify(data.user)
      );

      onAuth(data.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "حدث خطأ"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-3xl shadow p-7 space-y-4"
      >
        <button
          type="button"
          onClick={onBack}
          className="text-slate-400 text-sm"
        >
          رجوع
        </button>

        <div className="text-center">
          <img
            src="/icon-192.png"
            alt="وصلي"
            className="mx-auto w-16 h-16 rounded-2xl shadow"
          />

          <h1 className="text-3xl font-black mt-3">
            وصلي
          </h1>

          <p className="text-slate-500 mt-2">
            {effectiveMode === "login"
              ? "تسجيل الدخول"
              : `إنشاء حساب ${meta.label}`}
          </p>
        </div>

        {effectiveMode === "register" && (
          <>
            <input
              className="w-full border rounded-xl p-3"
              placeholder="الاسم الكامل"
              required
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />
          </>
        )}

        <input
          className="w-full border rounded-xl p-3"
          placeholder="رقم الهاتف"
          required
          onChange={(e) =>
            setForm({
              ...form,
              phone: e.target.value,
            })
          }
        />

        <input
          className="w-full border rounded-xl p-3"
          type="password"
          placeholder="كلمة المرور"
          minLength={6}
          required
          onChange={(e) =>
            setForm({
              ...form,
              password: e.target.value,
            })
          }
        />

        {effectiveMode === "register" &&
          role === "courier" && (
            <div className="space-y-2">
              <label className="text-sm text-slate-600">
                بطاقة التعريف
              </label>

              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) =>
                  setIdCard(
                    e.target.files?.[0] || null
                  )
                }
              />
            </div>
          )}

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full bg-green-600 text-white rounded-xl p-3 font-bold"
        >
          {loading
            ? "..."
            : effectiveMode === "login"
            ? "دخول"
            : "إنشاء حساب"}
        </button>

        {canRegister && (
          <button
            type="button"
            className="w-full text-green-700"
            onClick={() =>
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              )
            }
          >
            {mode === "login"
              ? "إنشاء حساب جديد"
              : "لدي حساب بالفعل"}
          </button>
        )}
      </form>
    </main>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(
        String(reader.result).split(",")[1]
      );

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}
