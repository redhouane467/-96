import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import MapView from "../components/MapView";
import type { MapMarker } from "../components/MapView";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

type Tab = "available" | "active" | "history";

export default function CourierDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("available");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await api<{ orders: Order[] }>("/orders");
      setOrders(res.orders || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  // قبول الطلب من قبل المندوب
  async function acceptOrder(id: string) {
    try {
      await api(`/orders/${id}/accept`, { method: "POST" });
      toast("تم قبول الطلب بنجاح! انتقل للطلبات النشطة", "success");
      setTab("active");
      loadOrders();
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر قبول الطلب", "error");
    }
  }

  // تحديث حالة الطلب (من مقبول -> تم الاستلام -> تم التوصيل)
  async function updateStatus(id: string, status: "picked_up" | "delivered") {
    try {
      await api(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const statusText = status === "picked_up" ? "تم استلام الشحنة" : "تم توصيل الطلب بنجاح 🎉";
      toast(statusText, "success");
      loadOrders();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل تحديث حالة الطلب", "error");
    }
  }

  // تصفية الطلبات حسب التبويب
  const availableOrders = orders.filter((o) => o.status === "pending");
  const activeOrders = orders.filter((o) => ["accepted", "picked_up"].includes(o.status));
  const historyOrders = orders.filter((o) => ["delivered", "cancelled"].includes(o.status));

  const currentList = tab === "available" ? availableOrders : tab === "active" ? activeOrders : historyOrders;

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="لوحة المندوب" subtitle={user.name} onLogout={onLogout} />

      <nav className="max-w-5xl mx-auto flex gap-2 p-4 flex-wrap">
        {(
          [
            ["available", `الطلبات المتاحة (${availableOrders.length})`],
            ["active", `الطلبات النشطة (${activeOrders.length})`],
            ["history", "سجل الطلبات"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl font-bold transition ${
              tab === k ? "bg-green-600 text-white shadow-sm" : "bg-white border text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="max-w-5xl mx-auto p-4 space-y-4">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={loadOrders} />
        ) : currentList.length === 0 ? (
          <EmptyState icon="🚚" label="لا توجد طلبات في هذا القسم حالياً" />
        ) : (
          currentList.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3 border border-slate-100">
              <OrderCard order={o} />

              {/* عرض شرح الطلب الموحد بشكل بارز للمندوب */}
              {o.package_description && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                  <span className="font-bold text-amber-900 block mb-1">📝 تفاصيل الطلب:</span>
                  <p className="text-amber-800 whitespace-pre-line">{o.package_description}</p>
                </div>
              )}

              {/* خريطة مصغرة توضح مسار التوصيل للمندوب */}
              {o.pickup_lat && o.delivery_lat && (
                <div className="rounded-xl overflow-hidden border">
                  <MapView
                    height="180px"
                    markers={[
                      { id: "pickup", lat: o.pickup_lat, lng: o.pickup_lng, color: "#16a34a", emoji: "📦", popupText: "الاستلام" },
                      { id: "delivery", lat: o.delivery_lat, lng: o.delivery_lng, color: "#dc2626", emoji: "🏁", popupText: "التسليم" },
                    ]}
                  />
                </div>
              )}

              {/* أزرار التحكم بحالة الطلب */}
              <div className="pt-2 border-t flex flex-wrap gap-2 justify-end">
                {o.status === "pending" && (
                  <button
                    onClick={() => acceptOrder(o.id)}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition"
                  >
                    قبول الطلب ✅
                  </button>
                )}

                {o.status === "accepted" && (
                  <button
                    onClick={() => updateStatus(o.id, "picked_up")}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition"
                  >
                    تم استلام الطلب من التاجر 📦
                  </button>
                )}

                {o.status === "picked_up" && (
                  <button
                    onClick={() => updateStatus(o.id, "delivered")}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition"
                  >
                    تأكيد وتسليم الطلب للعميل 🎉
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
