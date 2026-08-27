import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";

type Tab = "stats" | "orders" | "users" | "settings" | "complaints";

type Stats = {
  ordersByStatus: { status: string; c: number }[];
  usersByRole: { role: string; c: number }[];
  revenue: number;
};

export default function AdminDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("stats");
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Record<string, number> | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const fail = (e: unknown) => setMsg(e instanceof Error ? e.message : "خطأ");
    if (tab === "stats") api<Stats>("/admin/stats").then(setStats).catch(fail);
    if (tab === "orders") api<{ orders: Order[] }>("/orders").then((d) => setOrders(d.orders)).catch(fail);
    if (tab === "users") api<{ users: any[] }>("/admin/users").then((d) => setUsers(d.users)).catch(fail);
    if (tab === "settings")
      api<{ settings: Record<string, number> }>("/admin/settings").then((d) => setSettings(d.settings)).catch(fail);
    if (tab === "complaints")
      api<{ complaints: Complaint[] }>("/complaints").then((d) => setComplaints(d.complaints)).catch(fail);
  }, [tab]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    try {
      const d = await api<{ ok: boolean; settings: Record<string, number> }>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(d.settings);
      setMsg("تم حفظ الإعدادات");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "خطأ");
    }
  }

  async function respond(id: string, response: string) {
    try {
      await api(`/complaints/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", response }) });
      const d = await api<{ complaints: Complaint[] }>("/complaints");
      setComplaints(d.complaints);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "خطأ");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="إدارة" subtitle={user.name} onLogout={onLogout} />
      <nav className="max-w-5xl mx-auto flex gap-2 p-4 flex-wrap">
        {(
          [
            ["stats", "نظرة عامة"],
            ["orders", "الطلبات"],
            ["users", "المستخدمون"],
            ["settings", "الإعدادات"],
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

        {tab === "stats" && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stats.ordersByStatus.map((s) => (
              <div key={s.status} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="text-slate-500 text-sm">{s.status}</div>
                <div className="text-2xl font-black">{s.c}</div>
              </div>
            ))}
            <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
              <div className="text-slate-500 text-sm">إجمالي إيرادات الطلبات المكتملة</div>
              <div className="text-2xl font-black text-green-700">{stats.revenue} دج</div>
            </div>
          </div>
        )}

        {tab === "orders" &&
          (orders.length === 0 ? (
            <p className="text-slate-500">لا توجد طلبات بعد</p>
          ) : (
            orders.map((o) => <OrderCard key={o.id} order={o} />)
          ))}

        {tab === "users" && (
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {users.map((u) => (
              <div key={u.id} className="p-3 flex justify-between text-sm">
                <span>
                  {u.name} — {u.email}
                </span>
                <span className="text-slate-500">{u.role}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "settings" && settings && (
          <form onSubmit={saveSettings} className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
            {Object.entries(settings).map(([k, v]) => (
              <div key={k}>
                <label className="block text-sm text-slate-600 mb-1">{k}</label>
                <input
                  className="w-full border rounded-xl p-3"
                  type="number"
                  value={v}
                  onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
            <button className="bg-green-600 text-white rounded-xl px-5 py-3 font-bold">حفظ</button>
          </form>
        )}

        {tab === "complaints" &&
          complaints.map((c) => <ComplaintRow key={c.id} complaint={c} onRespond={(r) => respond(c.id, r)} />)}
      </section>
    </main>
  );
}

function ComplaintRow({ complaint, onRespond }: { complaint: Complaint; onRespond: (r: string) => void }) {
  const [text, setText] = useState(complaint.response || "");
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
      <p>{complaint.message}</p>
      <span className="text-xs text-slate-400">{complaint.status === "pending" ? "قيد المراجعة" : "تم الرد"}</span>
      {complaint.status === "pending" ? (
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl p-2"
            placeholder="الرد"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button onClick={() => onRespond(text)} className="bg-green-600 text-white rounded-xl px-4">
            إرسال
          </button>
        </div>
      ) : (
        <p className="text-sm text-green-700">الرد: {complaint.response}</p>
      )}
    </div>
  );
}