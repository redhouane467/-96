import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";

function NewOrderForm({ onCreated, setMsg }: { onCreated: () => void; setMsg: (s: string) => void }) {
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [distance, setDistance] = useState(2);
  const [suggest, setSuggest] = useState(false);
  const [price, setPrice] = useState(150);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          pickup_address: pickup,
          delivery_address: delivery,
          distance_km: distance,
          offered_price: suggest ? price : null,
        }),
      });
      onCreated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "خطأ");
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <input
        className="w-full border rounded-xl p-3"
        placeholder="عنوان الاستلام"
        required
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
      />
      <input
        className="w-full border rounded-xl p-3"
        placeholder="عنوان التسليم"
        required
        value={delivery}
        onChange={(e) => setDelivery(e.target.value)}
      />
      <div>
        <label className="block text-sm text-slate-600 mb-1">المسافة التقريبية (كم)</label>
        <input
          className="w-full border rounded-xl p-3"
          type="number"
          min={0.5}
          step={0.5}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
        />
      </div>
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
      <button className="w-full bg-green-600 text-white rounded-xl p-3 font-bold">إرسال الطلب</button>
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
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    await api("/complaints", { method: "POST", body: JSON.stringify({ message }) });
    setMessage("");
    onSubmitted();
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
      {complaints.map((c) => (
        <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-1">
          <p>{c.message}</p>
          <span className="text-xs text-slate-400">{c.status === "pending" ? "قيد المراجعة" : "تم الرد"}</span>
          {c.response && <p className="text-sm text-green-700">رد الإدارة: {c.response}</p>}
        </div>
      ))}
    </div>
  );
}

type Tab = "orders" | "new" | "complaints";

export default function CustomerDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [msg, setMsg] = useState("");

  async function loadOrders() {
    try {
      setOrders((await api<{ orders: Order[] }>("/orders")).orders);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
  }
  async function loadComplaints() {
    try {
      setComplaints((await api<{ complaints: Complaint[] }>("/complaints")).complaints);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
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
      loadOrders();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
  }
  async function rate(id: string, stars: number) {
    try {
      await api(`/orders/${id}/rate`, { method: "POST", body: JSON.stringify({ stars }) });
      loadOrders();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
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
        {msg && <div className="bg-white rounded-xl p-3 text-sm">{msg}</div>}

        {tab === "new" && (
          <NewOrderForm
            onCreated={() => {
              setTab("orders");
              loadOrders();
            }}
            setMsg={setMsg}
          />
        )}

        {tab === "orders" &&
          (orders.length === 0 ? (
            <p className="text-slate-500">لا توجد طلبات بعد</p>
          ) : (
            orders.map((o) => (
              <OrderCard key={o.id} order={o}>
                {o.status === "pending" && (
                  <button onClick={() => cancelOrder(o.id)} className="text-red-600 text-sm font-bold">
                    إلغاء الطلب
                  </button>
                )}
                {o.status === "accepted" && (
                  <div className="bg-amber-50 text-amber-800 rounded-lg p-2 text-sm">
                    أعطِ المندوب رمز التأكيد عند الاستلام: <b>{o.confirmation_code}</b>
                  </div>
                )}
                {o.status === "delivered" && <RateBox onRate={(s) => rate(o.id, s)} />}
              </OrderCard>
            ))
          ))}

        {tab === "complaints" && <ComplaintsTab complaints={complaints} onSubmitted={loadComplaints} />}
      </section>
    </main>
  );
}