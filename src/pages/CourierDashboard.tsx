import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { watchPosition } from "../lib/geolocation";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../lib/toast";
import type { Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import MapView from "../components/MapView";
import type { MapMarker } from "../components/MapView";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

const LOCATION_SEND_INTERVAL_MS = 15000;

export default function CourierDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState<boolean | null>(null);
  const [online, setOnline] = useState(false);
  const toast = useToast();
  const lastSentRef = useRef(0);
  const stopWatchRef = useRef<(() => void) | null>(null);

  async function loadMe() {
    try {
      const me = await api<{ approved: boolean; online: boolean }>("/auth/me");
      setApproved(me.approved);
      setOnline(me.online);
    } catch {
      /* non-critical */
    }
  }

  async function load() {
    try {
      setOrders((await api<{ orders: Order[] }>("/orders")).orders);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
    load();
  }, []);

  const mine = orders.filter((o) => o.courier_id === user.id);
  const hasActiveOrder = mine.some((o) => o.status === "accepted" || o.status === "picked_up");
  usePolling(load, 6000, online || hasActiveOrder);

  async function toggleOnline() {
    const next = !online;
    try {
      await api("/couriers/me/status", { method: "PATCH", body: JSON.stringify({ online: next }) });
      setOnline(next);
      toast(next ? "أنت الآن متصل" : "أنت الآن غير متصل", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  useEffect(() => {
    if (!online) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      return;
    }
    stopWatchRef.current = watchPosition(
      (coords) => {
        const now = Date.now();
        if (now - lastSentRef.current < LOCATION_SEND_INTERVAL_MS) return;
        lastSentRef.current = now;
        api("/couriers/me/location", { method: "PATCH", body: JSON.stringify(coords) }).catch(() => {});
      },
      (err) => toast(err.message, "error")
    );
    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function accept(id: string) {
    try {
      await api(`/orders/${id}/accept`, { method: "POST" });
      toast("تم قبول الطلب", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  async function pickup(id: string) {
    try {
      await api(`/orders/${id}/pickup`, { method: "POST" });
      toast("تم تأكيد استلام الطرد", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  // ✅ تم التعديل لإلغاء طلب رمز التأكيد وتأكيد التسليم مباشرة
  async function deliver(id: string) {
    try {
      await api(`/orders/${id}/deliver`, { method: "POST" });
      toast("تم تسليم الطلب بنجاح", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  const available = orders.filter((o) => o.status === "pending");
  const active = mine.filter((o) => o.status === "accepted" || o.status === "picked_up");

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="مندوب" subtitle={user.name} onLogout={onLogout} />
      <section className="max-w-5xl mx-auto p-4 space-y-6">
        {approved === false && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-center font-bold">
            ⏳ حسابك بانتظار اعتماد الإدارة — لن تتمكن من قبول الطلبات حتى تتم الموافقة
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-900">حالتك</div>
            <div className="text-sm text-slate-500">{online ? "متصل — تظهر لك الطلبات القريبة" : "غير متصل"}</div>
          </div>
          <button
            onClick={toggleOnline}
            disabled={approved === false}
            className={`px-5 py-2.5 rounded-full font-bold transition disabled:opacity-40 ${
              online ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {online ? "متصل ●" : "غير متصل"}
          </button>
        </div>

        {active.length > 0 && (
          <div>
            <h2 className="font-bold text-lg mb-2">طلبك الحالي</h2>
            <div className="space-y-3">
              {active.map((o) => (
                <ActiveOrderCard key={o.id} order={o} onPickup={() => pickup(o.id)}>
                  {o.status === "picked_up" && (
                    <div className="mt-2">
                      {/* ✅ زر التوصيل المباشر بضغطة واحدة بدون حقل إدخال الكود */}
                      <button
                        onClick={() => deliver(o.id)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors"
                      >
                        ✅ تم التوصيل وتسليم الطرد
                      </button>
                    </div>
                  )}
                </ActiveOrderCard>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="font-bold text-lg mb-2">طلبات قريبة متاحة</h2>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !online ? (
            <EmptyState icon="🛵" label="فعّل الاتصال لرؤية الطلبات القريبة" />
          ) : available.length === 0 ? (
            <EmptyState icon="📭" label="لا توجد طلبات متاحة حاليًا" />
          ) : (
            <div className="space-y-3">
              {available.map((o) => (
                <OrderCard key={o.id} order={o}>
                  <button
                    onClick={() => accept(o.id)}
                    disabled={approved === false}
                    className="w-full bg-green-600 text-white rounded-xl py-2 font-bold disabled:opacity-40"
                  >
                    قبول الطلب
                  </button>
                </OrderCard>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ActiveOrderCard({
  order,
  onPickup,
  children,
}: {
  order: Order;
  onPickup: () => void;
  children?: ReactNode;
}) {
  const markers: MapMarker[] = [];
  if (order.pickup_lat != null) markers.push({ id: "pickup", lat: order.pickup_lat, lng: order.pickup_lng!, color: "#16a34a", emoji: "📦" });
  if (order.delivery_lat != null) markers.push({ id: "delivery", lat: order.delivery_lat, lng: order.delivery_lng!, color: "#dc2626", emoji: "🏁" });

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <OrderCard order={order} />
      {markers.length > 0 && <MapView markers={markers} height="180px" />}
      {order.status === "accepted" && (
        <button onClick={onPickup} className="w-full bg-green-600 text-white rounded-xl py-2 font-bold">
          📦 تم استلام الطرد
        </button>
      )}
      {children}
    </div>
  );
}
