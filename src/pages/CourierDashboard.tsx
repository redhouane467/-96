import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";

export default function CourierDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  async function load() {
    try {
      setOrders((await api<{ orders: Order[] }>("/orders")).orders);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function accept(id: string) {
    try {
      await api(`/orders/${id}/accept`, { method: "POST" });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function deliver(id: string) {
    try {
      await api(`/orders/${id}/deliver`, {
        method: "POST",
        body: JSON.stringify({ confirmation_code: codeInputs[id] || "" }),
      });
      setMsg("تم تسليم الطلب بنجاح");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    }
  }

  const available = orders.filter((o) => o.status === "pending");
  const mine = orders.filter((o) => o.courier_id === user.id);

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="مندوب" subtitle={user.name} onLogout={onLogout} />
      <section className="max-w-5xl mx-auto p-4 space-y-6">
        {msg && <div className="bg-white rounded-xl p-3 text-sm">{msg}</div>}

        <div>
          <h2 className="font-bold text-lg mb-2">طلبات متاحة</h2>
          <div className="space-y-3">
            {available.length === 0 && <p className="text-slate-500">لا توجد طلبات متاحة حاليًا</p>}
            {available.map((o) => (
              <OrderCard key={o.id} order={o}>
                <button onClick={() => accept(o.id)} className="w-full bg-green-600 text-white rounded-xl py-2 font-bold">
                  قبول الطلب
                </button>
              </OrderCard>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-bold text-lg mb-2">طلباتي</h2>
          <div className="space-y-3">
            {mine.length === 0 && <p className="text-slate-500">لا توجد طلبات بعد</p>}
            {mine.map((o) => (
              <OrderCard key={o.id} order={o}>
                {o.status === "accepted" && (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded-xl p-2"
                      placeholder="رمز التأكيد من العميل"
                      value={codeInputs[o.id] || ""}
                      onChange={(e) => setCodeInputs({ ...codeInputs, [o.id]: e.target.value })}
                    />
                    <button onClick={() => deliver(o.id)} className="bg-green-600 text-white rounded-xl px-4 font-bold">
                      تأكيد التسليم
                    </button>
                  </div>
                )}
              </OrderCard>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
