import type { ReactNode } from "react";
import type { Order } from "../types";

export const statusLabels: Record<string, string> = {
  pending: "جاري البحث عن مندوب",
  accepted: "المندوب في الطريق للاستلام",
  picked_up: "الطرد في الطريق",
  delivered: "بانتظار تأكيدك",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-indigo-100 text-indigo-800",
  delivered: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function OrderCard({
  order,
  children,
}: {
  order: Order;
  children?: ReactNode;
}) {
  const statusLabel =
    statusLabels[order.status] || order.status;

  const statusColor =
    statusColors[order.status] ||
    "bg-slate-100 text-slate-700";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-start gap-3">
        <b className="text-sm text-slate-500">
          طلب #{order.id.slice(0, 8)}
        </b>

        <span
          className={`text-xs rounded-full px-2 py-1 font-bold ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="text-sm">
        📍 <b>الاستلام:</b> {order.pickup_address}
      </div>

      <div className="text-sm">
        🏁 <b>التوصيل:</b> {order.delivery_address}
      </div>

      {order.package_description && (
        <div className="text-sm text-slate-700">
          📦 <b>الطرد:</b> {order.package_description}
        </div>
      )}

      {order.recipient_phone && (
        <div className="text-sm text-slate-700">
          📞 <b>هاتف المستلم:</b>{" "}
          {order.recipient_phone}
        </div>
      )}

      {order.notes && (
        <div className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">
          📝 <b>ملاحظات:</b> {order.notes}
        </div>
      )}

      {order.distance_from_me_km != null && (
        <div className="text-xs text-green-700 font-bold">
          🛵 {order.distance_from_me_km} كم من موقعك
        </div>
      )}

      <div className="flex justify-between items-center">
        <b className="text-green-700 text-lg">
          {Number(order.final_price || 0)} دج
        </b>

        <span className="text-xs text-slate-400">
          {Number(order.distance_km || 0)} كم
        </span>
      </div>

      {children}
    </div>
  );
}
