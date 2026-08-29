import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

type Tab = "stats" | "couriers" | "orders" | "users" | "settings" | "complaints";

type Stats = {
  ordersByStatus: { status: string; c: number }[];
  usersByRole: { role: string; c: number }[];
  revenue: number;
  activeOrders: number;
  couriersOnline: number;
  couriersApproved: number;
  couriersPending: number;
};

type CourierRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  online: boolean | number;
  approved: boolean | number;
  location_updated_at: string | null;
};

export default function AdminDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("stats");
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Record<string, number> | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setError("");
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : "خطأ");
    const done = () => setLoading(false);
    if (tab === "stats") api<Stats>("/admin/stats").then(setStats).catch(fail).finally(done);
    if (tab === "orders") api<{ orders: Order[] }>("/orders").then((d) => setOrders(d.orders)).catch(fail).finally(done);
    if (tab === "users") api<{ users: any[] }>("/admin/users").then((d) => setUsers(d.users)).catch(fail).finally(done);
    if (tab === "couriers")
      api<{ couriers: CourierRow[] }>("/admin/couriers").then((d) => setCouriers(d.couriers)).catch(fail).finally(done);
    if (tab === "settings")
      api<{ settings: Record<string, number> }>("/admin/settings").then((d) => setSettings(d.settings)).catch(fail).finally(done);
    if (tab === "complaints")
      api<{ complaints: Complaint[] }>("/complaints").then((d) => setComplaints(d.complaints)).catch(fail).finally(done);
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
      toast("تم حفظ الإعدادات", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  async function respond(id: string, response: string) {
    try {
      await api(`/complaints/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved", response }) });
      const d = await api<{ complaints: Complaint[] }>("/complaints");
      setComplaints(d.complaints);
      toast("تم إرسال الرد", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  async function setApproval(id: string, approved: boolean) {
    try {
      await api(`/admin/couriers/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved }) });
      const d = await api<{ couriers: CourierRow[] }>("/admin/couriers");
      setCouriers(d.couriers);
      toast(approved ? "تم اعتماد المندوب" : "تم إلغاء الاعتماد", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header title="إدارة" subtitle={user.name} onLogout={onLogout} />
      <nav className="max-w-5xl mx-auto flex gap-2 p-4 flex-wrap">
        {(
          [
            ["stats", "نظرة عامة"],
            ["couriers", "المندوبون"],
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
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} />}

        {!loading && !error && tab === "stats" && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="طلبات نشطة" value={stats.activeOrders} />
            <StatCard label="مندوبون متصلون" value={stats.couriersOnline} />
            <StatCard label="مندوبون معتمدون" value={stats.couriersApproved} />
            <StatCard label="بانتظار الاعتماد" value={stats.couriersPending} accent="amber" />
            {stats.ordersByStatus.map((s) => (
              <StatCard key={s.status} label={s.status} value={s.c} />
            ))}
            <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
              <div className="text-slate-500 text-sm">إجمالي إيرادات الطلبات المكتملة</div>
              <div className="text-2xl font-black text-green-700">{stats.revenue} دج</div>
            </div>
          </div>
        )}

        {!loading && !error && tab === "couriers" &&
          (couriers.length === 0 ? (
            <EmptyState icon="🛵" label="لا يوجد مندوبون بعد" />
          ) : (
            <div className="space-y-3">
              {couriers.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-sm text-slate-500" dir="ltr">
                        {c.phone}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs rounded-full px-2 py-1 font-bold ${c.approved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                        {c.approved ? "معتمد" : "بانتظار الاعتماد"}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-1 ${c.online ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.online ? "متصل" : "غير متصل"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setApproval(c.id, !c.approved)}
                    className={`w-full rounded-xl py-2 font-bold text-sm ${c.approved ? "bg-red-50 text-red-700" : "bg-green-600 text-white"}`}
                  >
                    {c.approved ? "إلغاء الاعتماد" : "اعتماد المندوب"}
                  </button>
                </div>
              ))}
            </div>
          ))}

        {!loading && !error && tab === "orders" &&
          (orders.length === 0 ? <EmptyState icon="📦" label="لا توجد طلبات بعد" /> : orders.map((o) => <OrderCard key={o.id} order={o} />))}

        {!loading && !error && tab === "users" && (
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

        {!loading && !error && tab === "settings" && settings && (
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

        {!loading && !error && tab === "complaints" &&
          (complaints.length === 0 ? (
            <EmptyState icon="✅" label="لا توجد شكاوى" />
          ) : (
            complaints.map((c) => <ComplaintRow key={c.id} complaint={c} onRespond={(r) => respond(c.id, r)} />)
          ))}
      </section>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "amber" }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className={`text-2xl font-black ${accent === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
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
