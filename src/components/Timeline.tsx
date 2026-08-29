import type { OrderHistoryEntry, OrderStatus } from "../types";

type Step = { key: OrderStatus; label: string; doneAt: (h: OrderHistoryEntry[]) => string | null };

const STEPS: Step[] = [
  { key: "pending", label: "تم إنشاء الطلب", doneAt: (h) => h.find((e) => e.status === "pending")?.created_at || null },
  { key: "accepted", label: "تم تعيين مندوب", doneAt: (h) => h.find((e) => e.status === "accepted")?.created_at || null },
  { key: "picked_up", label: "تم استلام الطرد", doneAt: (h) => h.find((e) => e.status === "picked_up")?.created_at || null },
  { key: "delivered", label: "تم التسليم", doneAt: (h) => h.find((e) => e.status === "delivered")?.created_at || null },
  { key: "completed", label: "اكتمل الطلب", doneAt: (h) => h.find((e) => e.status === "completed")?.created_at || null },
];

const IN_PROGRESS_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: "جاري البحث عن مندوب…",
  accepted: "المندوب في الطريق للاستلام…",
  picked_up: "الطرد في الطريق إليك…",
  delivered: "بانتظار تأكيدك للاستلام…",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Timeline({ status, history }: { status: OrderStatus; history: OrderHistoryEntry[] }) {
  if (status === "cancelled") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-center font-bold">
        ✕ تم إلغاء هذا الطلب
      </div>
    );
  }

  const stepOrder = STEPS.map((s) => s.key);
  const currentIndex = stepOrder.indexOf(status);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-0">
      {STEPS.map((step, i) => {
        const at = step.doneAt(history);
        const done = at !== null;
        const isCurrent = i === currentIndex;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-400"
                } ${isCurrent ? "ring-4 ring-green-100" : ""}`}
              >
                {done ? "✓" : i + 1}
              </div>
              {!isLast && <div className={`w-0.5 flex-1 min-h-[24px] ${done ? "bg-green-600" : "bg-slate-200"}`} />}
            </div>
            <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
              <div className={`font-bold ${done ? "text-slate-900" : "text-slate-400"}`}>{step.label}</div>
              {isCurrent && IN_PROGRESS_LABEL[status] && (
                <div className="text-sm text-green-700 mt-0.5">{IN_PROGRESS_LABEL[status]}</div>
              )}
              {at && <div className="text-xs text-slate-400 mt-0.5">{formatTime(at)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
