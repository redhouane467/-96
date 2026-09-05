import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

type Tab =
  | "stats"
  | "couriers"
  | "orders"
  | "users"
  | "settings"
  | "complaints";

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
  email: string | null;
  phone: string;
  online: boolean | number;
  approved: boolean | number;
  location_updated_at: string | null;
  has_id_card?: boolean;
  courier_debt?: number;
};

export default function AdminDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("stats");
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] =
    useState<Record<string, number> | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [idCardLoading, setIdCardLoading] = useState(false);
  const [debtLoading, setDebtLoading] = useState<string | null>(null);

  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setError("");

    const fail = (e: unknown) =>
      setError(e instanceof Error ? e.message : "خطأ");

    const done = () => setLoading(false);

    if (tab === "stats") {
      api<Stats>("/admin/stats")
        .then(setStats)
        .catch(fail)
        .finally(done);
    }

    if (tab === "orders") {
      api<{ orders: Order[] }>("/orders")
        .then((d) => setOrders(d.orders))
        .catch(fail)
        .finally(done);
    }

    if (tab === "users") {
      api<{ users: any[] }>("/admin/users")
        .then((d) => setUsers(d.users))
        .catch(fail)
        .finally(done);
    }

    if (tab === "couriers") {
      api<{ couriers: CourierRow[] }>("/admin/couriers")
        .then((d) => setCouriers(d.couriers))
        .catch(fail)
        .finally(done);
    }

    if (tab === "settings") {
      api<{ settings: Record<string, number> }>("/admin/settings")
        .then((d) => setSettings(d.settings))
        .catch(fail)
        .finally(done);
    }

    if (tab === "complaints") {
      api<{ complaints: Complaint[] }>("/complaints")
        .then((d) => setComplaints(d.complaints))
        .catch(fail)
        .finally(done);
    }
  }, [tab]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();

    if (!settings) return;

    try {
      const d = await api<{
        ok: boolean;
        settings: Record<string, number>;
      }>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });

      setSettings(d.settings);
      toast("تم حفظ الإعدادات", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "خطأ",
        "error"
      );
    }
  }

  async function respond(id: string, response: string) {
    if (!response.trim()) {
      toast("اكتب الرد أولًا", "error");
      return;
    }

    try {
      await api(`/complaints/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "resolved",
          response,
        }),
      });

      const d = await api<{ complaints: Complaint[] }>(
        "/complaints"
      );

      setComplaints(d.complaints);

      toast("تم إرسال الرد", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "خطأ",
        "error"
      );
    }
  }

  async function setApproval(
    id: string,
    approved: boolean
  ) {
    try {
      await api(`/admin/couriers/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
      });

      const d = await api<{ couriers: CourierRow[] }>(
        "/admin/couriers"
      );

      setCouriers(d.couriers);

      toast(
        approved
          ? "تم اعتماد المندوب"
          : "تم إلغاء الاعتماد",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "خطأ",
        "error"
      );
    }
  }

  async function markDebtPaid(id: string) {
    if (debtLoading) return;

    const courier = couriers.find((c) => c.id === id);
    const debt = Number(courier?.courier_debt || 0);

    if (debt <= 0) {
      toast("لا يوجد دين مستحق على هذا المندوب", "success");
      return;
    }

    const confirmed = window.confirm(
      `هل استلمت كامل الدين المستحق من المندوب؟\n\nالمبلغ: ${debt} دج\n\nسيتم تصفير الدين بالكامل.`
    );

    if (!confirmed) return;

    setDebtLoading(id);

    try {
      const d = await api<{
        ok: boolean;
        courier_debt: number;
      }>(`/admin/couriers/${id}/debt/paid`, {
        method: "PATCH",
      });

      setCouriers((current) =>
        current.map((c) =>
          c.id === id
            ? {
                ...c,
                courier_debt: d.courier_debt,
              }
            : c
        )
      );

      toast("تم تسجيل استلام الدين وتصفيره", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "تعذر تحديث الدين",
        "error"
      );
    } finally {
      setDebtLoading(null);
    }
  }

  async function viewIdCard(id: string) {
    setIdCardLoading(true);

    try {
      const token = localStorage.getItem("wassli_token");

      const response = await fetch(
        `/api/admin/couriers/${id}/id-card`,
        {
          headers: {
            Authorization: token
              ? `Bearer ${token}`
              : "",
          },
        }
      );

      if (!response.ok) {
        let message = "تعذر تحميل بطاقة التعريف";

        try {
          const data = await response.json();

          if (data?.error) {
            message = data.error;
          }
        } catch {
          // تجاهل خطأ قراءة JSON
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setIdCardUrl((oldUrl) => {
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }

        return url;
      });
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "تعذر تحميل بطاقة التعريف",
        "error"
      );
    } finally {
      setIdCardLoading(false);
    }
  }

  function closeIdCard() {
    if (idCardUrl) {
      URL.revokeObjectURL(idCardUrl);
    }

    setIdCardUrl(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <Header
        title="إدارة"
        subtitle={user.name}
        onLogout={onLogout}
      />

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
            className={`px-4 py-2 rounded-xl font-bold ${
              tab === k
                ? "bg-green-600 text-white"
                : "bg-white border"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="max-w-5xl mx-auto p-4 space-y-4">
        {loading && <LoadingState />}

        {!loading && error && (
          <ErrorState message={error} />
        )}

        {!loading &&
          !error &&
          tab === "stats" &&
          stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                label="طلبات نشطة"
                value={stats.activeOrders}
              />

              <StatCard
                label="مندوبون متصلون"
                value={stats.couriersOnline}
              />

              <StatCard
                label="مندوبون معتمدون"
                value={stats.couriersApproved}
              />

              <StatCard
                label="بانتظار الاعتماد"
                value={stats.couriersPending}
                accent="amber"
              />

              {stats.ordersByStatus.map((s) => (
                <StatCard
                  key={s.status}
                  label={s.status}
                  value={s.c}
                />
              ))}

              <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
                <div className="text-slate-500 text-sm">
                  إجمالي إيرادات الطلبات المكتملة
                </div>

                <div className="text-2xl font-black text-green-700">
                  {stats.revenue} دج
                </div>
              </div>
            </div>
          )}

        {!loading &&
          !error &&
          tab === "couriers" &&
          (couriers.length === 0 ? (
            <EmptyState
              icon="🛵"
              label="لا يوجد مندوبون بعد"
            />
          ) : (
            <div className="space-y-3">
              {couriers.map((c) => {
                const debt = Number(c.courier_debt || 0);

                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">
                          {c.name}
                        </div>

                        <div
                          className="text-sm text-slate-500 mt-1"
                          dir="ltr"
                        >
                          {c.phone}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-xs rounded-full px-2 py-1 font-bold ${
                            c.approved
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.approved
                            ? "معتمد"
                            : "بانتظار الاعتماد"}
                        </span>

                        <span
                          className={`text-xs rounded-full px-2 py-1 ${
                            c.online
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {c.online
                            ? "متصل"
                            : "غير متصل"}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`rounded-xl p-3 ${
                        debt > 0
                          ? "bg-red-50"
                          : "bg-green-50"
                      }`}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div>
                          <div
                            className={`text-sm font-bold ${
                              debt > 0
                                ? "text-red-700"
                                : "text-green-700"
                            }`}
                          >
                            الديون الواجبة للتطبيق
                          </div>

                          <div
                            className={`text-2xl font-black mt-1 ${
                              debt > 0
                                ? "text-red-700"
                                : "text-green-700"
                            }`}
                          >
                            {debt} دج
                          </div>
                        </div>

                        {debt > 0 && (
                          <button
                            onClick={() =>
                              markDebtPaid(c.id)
                            }
                            disabled={
                              debtLoading === c.id
                            }
                            className="bg-green-600 text-white rounded-xl px-4 py-3 font-bold text-sm disabled:opacity-50"
                          >
                            {debtLoading === c.id
                              ? "جاري التسجيل..."
                              : "تم الاستلام"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={`rounded-xl p-3 text-sm ${
                        c.has_id_card
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {c.has_id_card
                        ? "✅ بطاقة التعريف مرفوعة"
                        : "❌ بطاقة التعريف غير موجودة"}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.has_id_card && (
                        <button
                          onClick={() =>
                            viewIdCard(c.id)
                          }
                          disabled={idCardLoading}
                          className="w-full rounded-xl py-2 font-bold text-sm bg-blue-50 text-blue-700 disabled:opacity-50"
                        >
                          {idCardLoading
                            ? "جاري التحميل..."
                            : "👁 عرض بطاقة التعريف"}
                        </button>
                      )}

                      <button
                        onClick={() =>
                          setApproval(
                            c.id,
                            !Boolean(c.approved)
                          )
                        }
                        className={`w-full rounded-xl py-2 font-bold text-sm ${
                          c.approved
                            ? "bg-red-50 text-red-700"
                            : "bg-green-600 text-white"
                        }`}
                      >
                        {c.approved
                          ? "إلغاء الاعتماد"
                          : "اعتماد المندوب"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {!loading &&
          !error &&
          tab === "orders" &&
          (orders.length === 0 ? (
            <EmptyState
              icon="📦"
              label="لا توجد طلبات بعد"
            />
          ) : (
            orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
              />
            ))
          ))}

        {!loading &&
          !error &&
          tab === "users" && (
            <div className="bg-white rounded-2xl shadow-sm divide-y">
              {users.length === 0 ? (
                <div className="p-5 text-center text-slate-500">
                  لا يوجد مستخدمون
                </div>
              ) : (
                users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 flex justify-between items-center gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-bold">
                        {u.name}
                      </div>

                      <div
                        className="text-slate-500 mt-1"
                        dir="ltr"
                      >
                        {u.phone}
                      </div>

                      {u.email && (
                        <div
                          className="text-xs text-slate-400 mt-1"
                          dir="ltr"
                        >
                          {u.email}
                        </div>
                      )}
                    </div>

                    <span className="text-slate-500 shrink-0">
                      {u.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

        {!loading &&
          !error &&
          tab === "settings" &&
          settings && (
            <form
              onSubmit={saveSettings}
              className="bg-white rounded-2xl p-5 shadow-sm space-y-3"
            >
              {Object.entries(settings).map(([k, v]) => (
                <div key={k}>
                  <label className="block text-sm text-slate-600 mb-1">
                    {k}
                  </label>

                  <input
                    className="w-full border rounded-xl p-3"
                    type="number"
                    value={v}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [k]: Number(
                          e.target.value
                        ),
                      })
                    }
                  />
                </div>
              ))}

              <button className="bg-green-600 text-white rounded-xl px-5 py-3 font-bold">
                حفظ
              </button>
            </form>
          )}

        {!loading &&
          !error &&
          tab === "complaints" &&
          (complaints.length === 0 ? (
            <EmptyState
              icon="✅"
              label="لا توجد شكاوى"
            />
          ) : (
            complaints.map((c) => (
              <ComplaintRow
                key={c.id}
                complaint={c}
                onRespond={(r) =>
                  respond(c.id, r)
                }
              />
            ))
          ))}
      </section>

      {idCardUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={closeIdCard}
        >
          <div
            className="relative bg-white rounded-2xl p-3 max-w-3xl max-h-[90vh] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeIdCard}
              className="absolute top-2 left-2 z-10 bg-red-600 text-white rounded-full w-10 h-10 font-bold text-xl"
              aria-label="إغلاق"
            >
              ×
            </button>

            <div className="pt-2 flex items-center justify-center max-h-[85vh] overflow-auto">
              <img
                src={idCardUrl}
                alt="بطاقة تعريف المندوب"
                className="max-w-full max-h-[80vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber";
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="text-slate-500 text-sm">
        {label}
      </div>

      <div
        className={`text-2xl font-black ${
          accent === "amber"
            ? "text-amber-600"
            : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ComplaintRow({
  complaint,
  onRespond,
}: {
  complaint: Complaint;
  onRespond: (r: string) => void;
}) {
  const [text, setText] = useState(
    complaint.response || ""
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
      <p>{complaint.message}</p>

      <span className="text-xs text-slate-400">
        {complaint.status === "pending"
          ? "قيد المراجعة"
          : "تم الرد"}
      </span>

      {complaint.status === "pending" ? (
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl p-2"
            placeholder="الرد"
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
          />

          <button
            onClick={() => onRespond(text)}
            className="bg-green-600 text-white rounded-xl px-4"
          >
            إرسال
          </button>
        </div>
      ) : (
        <p className="text-sm text-green-700">
          الرد: {complaint.response}
        </p>
      )}
    </div>
  );
}
