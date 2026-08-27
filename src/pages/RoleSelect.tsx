import type { Role } from "../types";

const ROLES: { role: Role; label: string; emoji: string; hint: string }[] = [
  { role: "customer", label: "عميل", emoji: "👤", hint: "أطلب توصيل طلبك" },
  { role: "courier", label: "مندوب", emoji: "🛵", hint: "وصّل الطلبات واربح" },
  { role: "admin", label: "مدير", emoji: "👨‍💼", hint: "لوحة إدارة المنصة" },
];

export default function RoleSelect({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-green-50 to-slate-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <img
            src="/icon-192.png"
            alt="وصلي"
            className="mx-auto w-24 h-24 rounded-3xl shadow-lg shadow-green-900/10"
          />
          <h1 className="text-4xl font-black text-slate-900">وصلي</h1>
          <p className="text-slate-500">توصيل سريع وبسيط</p>
        </div>

        <div className="space-y-4">
          <p className="text-center text-slate-600 font-medium">اختر نوع الحساب للمتابعة</p>
          {ROLES.map(({ role, label, emoji, hint }) => (
            <button
              key={role}
              onClick={() => onSelect(role)}
              className="w-full flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 active:scale-[0.98] active:bg-green-50 transition"
            >
              <span className="text-4xl leading-none">{emoji}</span>
              <span className="flex-1 text-right">
                <span className="block text-xl font-bold text-slate-900">{label}</span>
                <span className="block text-sm text-slate-500">{hint}</span>
              </span>
              <span className="text-green-600 text-2xl">‹</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}