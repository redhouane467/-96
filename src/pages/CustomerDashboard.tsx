import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { getCurrentPosition, haversineKm } from "../lib/geolocation";
import { useToast } from "../lib/toast";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import MapView from "../components/MapView";
import type { MapMarker } from "../components/MapView";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import OrderTracking from "./OrderTracking";

type Tab = "orders" | "new" | "complaints";

export default function CustomerDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const toast = useToast();

  async function loadOrders() {
    try {
      setOrders((await api<{ orders: Order[] }>("/orders")).orders);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }
  async function loadComplaints() {
    try {
      setComplaints((await api<{ complaints: Complaint[] }>("/complaints")).complaints);
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);
  useEffect(() => {
    if (tab === "complaints") loadComplaints();
  }, [tab]);

  async function cancelOrder(id: string) {
    try {
      await api(`/orders/${id}/cancel`, { method: "POST" });
      toast("تم إلغاء الطلب", "success");
      loadOrders();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }
  async function rate(id: string, stars: number) {
    try {
      await api(`/orders/${id}/rate`, { method: "POST", body: JSON.stringify({ stars }) });
      toast("شكرًا لتقييمك!", "success");
      loadOrders();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  if (trackingId) {
    return (
      <main className="min-h-screen bg-slate-50 pb-10">
        <Header title="عميل" subtitle={user.name} onLogout={onLogout} />
        <section className="max-w-5xl mx-auto p-4">
          <OrderTracking
            orderId={trackingId}
            onClose={() => {
              setTrackingId(null);
              loadOrders();
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="عميل" subtitle={user.name} onLogout={onLogout} />
      <nav className="max-w-5xl mx-auto flex gap-2 p-4 flex-wrap">
        {(
          [
            ["orders", "طلباتي"],
            ["new", "طلب جديد"],
            ["complaints", "الشكاوى"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl font-bold ${tab === k ? "bg-green-600 text-white" : "bg-white border"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="max-w-5xl mx-auto p-4 space-y-4">
        {tab === "new" && (
          <NewOrderForm
            onCreated={() => {
              toast("تم إرسال طلبك بنجاح", "success");
              setTab("orders");
              loadOrders();
            }}
          />
        )}

        {tab === "orders" &&
          (loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={loadOrders} />
          ) : orders.length === 0 ? (
            <EmptyState icon="📦" label="لا توجد طلبات بعد" />
          ) : (
            orders.map((o) => (
              <OrderCard key={o.id} order={o}>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTrackingId(o.id)} className="text-green-700 text-sm font-bold">
                    تتبع الطلب ‹
                  </button>
                  {o.status === "pending" && (
                    <button onClick={() => cancelOrder(o.id)} className="text-red-600 text-sm font-bold">
                      إلغاء الطلب
                    </button>
                  )}
                </div>
                {o.status === "delivered" && <RateBox onRate={(s) => rate(o.id, s)} />}
              </OrderCard>
            ))
          ))}

        {tab === "complaints" && <ComplaintsTab complaints={complaints} onSubmitted={loadComplaints} />}
      </section>
    </main>
  );
}

function NewOrderForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [delivery, setDelivery] = useState<{ lat: number; lng: number } | null>(null);
  const [pickingMode, setPickingMode] = useState<"pickup" | "delivery">("pickup");
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [price, setPrice] = useState(150);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const distanceKm = pickup && delivery ? Math.round(haversineKm(pickup.lat, pickup.lng, delivery.lat, delivery.lng) * 10) / 10 : null;
  const estimatedPrice = distanceKm != null ? 150 + Math.max(0, distanceKm - 2) * 50 : null;

  function handleMapClick(lat: number, lng: number) {
    if (pickingMode === "pickup") {
      setPickup({ lat, lng });
      setPickingMode("delivery");
    } else {
      setDelivery({ lat, lng });
    }
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const c = await getCurrentPosition();
      setPickup(c);
      setPickingMode("delivery");
      toast("تم تحديد موقعك الحالي كنقطة استلام", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذّر تحديد الموقع", "error");
    } finally {
      setLocating(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pickup || !delivery) {
      toast("حدّد نقطتي الاستلام والتسليم على الخريطة", "error");
      return;
    }
    if (!pickupAddress.trim() || !deliveryAddress.trim()) {
      toast("أدخل وصفًا لعنوان الاستلام والتسليم", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          delivery_lat: delivery.lat,
          delivery_lng: delivery.lng,
          package_description: packageDescription || null,
          recipient_phone: recipientPhone || null,
          notes: notes || null,
          offered_price: suggest ? price : null,
        }),
      });
      onCreated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطأ", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const markers: MapMarker[] = [];
  if (pickup) markers.push({ id: "pickup", lat: pickup.lat, lng: pickup.lng, color: "#16a34a", emoji: "📦", popupText: "الاستلام" });
  if (delivery) markers.push({ id: "delivery", lat: delivery.lat, lng: delivery.lng, color: "#dc2626", emoji: "🏁", popupText: "التسليم" });

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700">
            {pickingMode === "pickup" ? "اضغط على الخريطة لتحديد نقطة الاستلام" : "اضغط على الخريطة لتحديد نقطة التسليم"}
          </p>
          <button type="button" onClick={useMyLocation} disabled={locating} className="text-xs text-green-700 font-bold shrink-0">
            {locating ? "..." : "📍 موقعي الحالي"}
          </button>
        </div>
        <MapView markers={markers} onMapClick={handleMapClick} height="240px" />
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPickingMode("pickup")}
            className={`flex-1 rounded-lg py-2 font-bold ${pickingMode === "pickup" ? "bg-green-600 text-white" : "bg-slate-100"}`}
          >
            📦 تحديد الاستلام {pickup && "✓"}
          </button>
          <button
            type="button"
            onClick={() => setPickingMode("delivery")}
            className={`flex-1 rounded-lg py-2 font-bold ${pickingMode === "delivery" ? "bg-green-600 text-white" : "bg-slate-100"}`}
          >
            🏁 تحديد التسليم {delivery && "✓"}
          </button>
        </div>
        {distanceKm != null && (
          <div className="text-center text-sm text-slate-600 bg-slate-50 rounded-lg py-2">
            المسافة التقريبية: <b>{distanceKm} كم</b> — السعر التقديري: <b className="text-green-700">{Math.round(estimatedPrice!)} دج</b>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <input
          className="w-full border rounded-xl p-3"
          placeholder="وصف عنوان الاستلام (مثال: بجانب صيدلية النور)"
          required
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
        />
        <input
          className="w-full border rounded-xl p-3"
          placeholder="وصف عنوان التسليم"
          required
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
        />
        <input
          className="w-full border rounded-xl p-3"
          placeholder="وصف الطرد (اختياري)"
          value={packageDescription}
          onChange={(e) => setPackageDescription(e.target.value)}
        />
        <input
          className="w-full border rounded-xl p-3"
          placeholder="هاتف المستلم (اختياري)"
          value={recipientPhone}
          onChange={(e) => setRecipientPhone(e.target.value)}
        />
        <textarea
          className="w-full border rounded-xl p-3"
          placeholder="ملاحظات (اختياري)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="text-xs text-slate-500">150 دج حتى 2 كم، ثم +50 دج لكل كم إضافي</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={suggest} onChange={(e) => setSuggest(e.target.checked)} />
          أريد اقتراح سعري الخاص
        </label>
        {suggest && (
          <input
            className="w-full border rounded-xl p-3"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        )}
        <button disabled={submitting} className="w-full bg-green-600 text-white rounded-xl p-3 font-bold disabled:opacity-60">
          {submitting ? "..." : "تأكيد الطلب"}
        </button>
      </div>
    </form>
  );
}

function RateBox({ onRate }: { onRate: (stars: number) => void }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-600">قيّم المندوب</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            disabled={sent}
            onClick={() => {
              setSent(true);
              onRate(n);
            }}
            className="text-2xl disabled:opacity-40"
          >
            ⭐
          </button>
        ))}
      </div>
    </div>
  );
}

function ComplaintsTab({ complaints, onSubmitted }: { complaints: Complaint[]; onSubmitted: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      await api("/complaints", { method: "POST", body: JSON.stringify({ message }) });
      setMessage("");
      toast("تم إرسال شكواك", "success");
      onSubmitted();
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطأ", "error");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <textarea
          className="w-full border rounded-xl p-3"
          placeholder="اكتب شكواك هنا"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="bg-green-600 text-white rounded-xl px-5 py-3 font-bold">إرسال الشكوى</button>
      </form>
      {complaints.length === 0 ? (
        <EmptyState icon="✅" label="لا توجد شكاوى" />
      ) : (
        complaints.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-1">
            <p>{c.message}</p>
            <span className="text-xs text-slate-400">{c.status === "pending" ? "قيد المراجعة" : "تم الرد"}</span>
            {c.response && <p className="text-sm text-green-700">رد الإدارة: {c.response}</p>}
          </div>
        ))
      )}
    </div>
  );
}
