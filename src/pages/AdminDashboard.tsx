import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import type { Complaint, Order, User } from "../types";
import Header from "../components/Header";
import OrderCard from "../components/OrderCard";
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from "../components/States";

type Tab =
  | "stats"
  | "couriers"
  | "orders"
  | "users"
  | "settings"
  | "complaints";

type Stats = {
  ordersByStatus?: {
    status: string;
    c: number;
  }[] | null;

  usersByRole?: {
    role: string;
    c: number;
  }[] | null;

  revenue?: number | null;
  activeOrders?: number | null;
  couriersOnline?: number | null;
  couriersApproved?: number | null;
  couriersPending?: number | null;

  users?: number | null;
  customers?: number | null;
  couriers?: number | null;
  approvedCouriers?: number | null;
  orders?: number | null;
  completed?: number | null;
};

type CourierRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;

  online:
    | boolean
    | number
    | string;

  approved:
    | boolean
    | number
    | string;

  location_updated_at:
    string | null;

  has_id_card?: boolean;

  courier_debt?: number | string;
};

function toBoolean(
  value:
    | boolean
    | number
    | string
    | undefined
    | null
): boolean {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

export default function AdminDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [tab, setTab] =
    useState<Tab>("stats");

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [users, setUsers] =
    useState<any[]>([]);

  const [couriers, setCouriers] =
    useState<CourierRow[]>([]);

  const [stats, setStats] =
    useState<Stats | null>(null);

  const [settings, setSettings] =
    useState<
      Record<string, number> | null
    >(null);

  const [complaints, setComplaints] =
    useState<Complaint[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [idCardUrl, setIdCardUrl] =
    useState<string | null>(null);

  const [idCardLoading, setIdCardLoading] =
    useState(false);

  const [debtLoading, setDebtLoading] =
    useState<string | null>(null);

  const toast = useToast();

  async function loadStats() {
    try {
      const response =
        await api<{
          stats?: Stats;
        }>("/admin/stats");

      const serverStats =
        response?.stats || {};

      let courierList: CourierRow[] =
        couriers;

      try {
        const courierResponse =
          await api<{
            couriers?: CourierRow[];
          }>("/admin/couriers");

        courierList =
          Array.isArray(
            courierResponse?.couriers
          )
            ? courierResponse.couriers
            : [];

        setCouriers(
          courierList
        );
      } catch {
        // إذا تعذر تحميل المندوبين
        // نستخدم القائمة الموجودة
      }

      const onlineCount =
        courierList.filter(
          (c) =>
            toBoolean(c.online)
        ).length;

      const approvedCount =
        courierList.filter(
          (c) =>
            toBoolean(c.approved)
        ).length;

      const pendingCount =
        courierList.filter(
          (c) =>
            !toBoolean(c.approved)
        ).length;

      setStats({
        ...serverStats,

        ordersByStatus:
          Array.isArray(
            serverStats.ordersByStatus
          )
            ? serverStats.ordersByStatus
            : [],

        usersByRole:
          Array.isArray(
            serverStats.usersByRole
          )
            ? serverStats.usersByRole
            : [],

        revenue:
          Number(
            serverStats.revenue ?? 0
          ),

        activeOrders:
          Number(
            serverStats.activeOrders ?? 0
          ),

        couriersOnline:
          onlineCount,

        couriersApproved:
          approvedCount,

        couriersPending:
          pendingCount,
      });

      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "خطأ في تحميل الإحصائيات"
      );
    }
  }

  async function loadCouriers() {
    try {
      const response =
        await api<{
          couriers?: CourierRow[];
        }>("/admin/couriers");

      const list =
        Array.isArray(
          response?.couriers
        )
          ? response.couriers
          : [];

      setCouriers(list);

      setStats((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          couriersOnline:
            list.filter((c) =>
              toBoolean(c.online)
            ).length,

          couriersApproved:
            list.filter((c) =>
              toBoolean(c.approved)
            ).length,

          couriersPending:
            list.filter(
              (c) =>
                !toBoolean(c.approved)
            ).length,
        };
      });
    } catch (e) {
      if (tab === "couriers") {
        throw e;
      }
    }
  }

  async function loadOrders() {
    const response =
      await api<{
        orders?: Order[];
      }>("/orders");

    setOrders(
      Array.isArray(
        response?.orders
      )
        ? response.orders
        : []
    );
  }

  async function loadUsers() {
    const response =
      await api<{
        users?: any[];
      }>("/admin/users");

    setUsers(
      Array.isArray(
        response?.users
      )
        ? response.users
        : []
    );
  }

  async function loadSettings() {
    const response =
      await api<{
        settings?: Record<
          string,
          number | string
        >;
      }>("/admin/settings");

    const raw =
      response?.settings || {};

    const converted: Record<
      string,
      number
    > = {};

    for (const [
      key,
      value,
    ] of Object.entries(raw)) {
      converted[key] =
        Number(value ?? 0);
    }

    setSettings(converted);
  }

  async function loadComplaints() {
    const response =
      await api<{
        complaints?: Complaint[];
      }>("/complaints");

    setComplaints(
      Array.isArray(
        response?.complaints
      )
        ? response.complaints
        : []
    );
  }

  async function loadCurrentTab() {
    setLoading(true);
    setError("");

    try {
      if (tab === "stats") {
        await loadStats();
      }

      if (tab === "orders") {
        await loadOrders();
      }

      if (tab === "users") {
        await loadUsers();
      }

      if (tab === "couriers") {
        await loadCouriers();
      }

      if (tab === "settings") {
        await loadSettings();
      }

      if (tab === "complaints") {
        await loadComplaints();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "خطأ"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentTab();
  }, [tab]);

  useEffect(() => {
    if (tab !== "stats") {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          loadStats().catch(() => {});
        },
        10000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [tab]);

  async function saveSettings(
    e: FormEvent
  ) {
    e.preventDefault();

    if (!settings) {
      return;
    }

    try {
      const response =
        await api<{
          ok?: boolean;
          settings?: Record<
            string,
            number | string
          >;
        }>("/admin/settings", {
          method: "PATCH",
          body: JSON.stringify(
            settings
          ),
        });

      const raw =
        response.settings || {};

      const converted: Record<
        string,
        number
      > = {};

      for (const [
        key,
        value,
      ] of Object.entries(raw)) {
        converted[key] =
          Number(value ?? 0);
      }

      setSettings(converted);

      toast(
        "تم حفظ الإعدادات",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "خطأ",
        "error"
      );
    }
  }

  async function respond(
    id: string,
    responseText: string
  ) {
    if (!responseText.trim()) {
      toast(
        "اكتب الرد أولًا",
        "error"
      );
      return;
    }

    try {
      await api(
        `/complaints/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "resolved",
            response:
              responseText,
          }),
        }
      );

      await loadComplaints();

      toast(
        "تم إرسال الرد",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "خطأ",
        "error"
      );
    }
  }

  async function setApproval(
    id: string,
    approved: boolean
  ) {
    try {
      await api(
        `/admin/couriers/${id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            approved,
          }),
        }
      );

      await loadCouriers();

      await loadStats();

      toast(
        approved
          ? "تم اعتماد المندوب"
          : "تم إلغاء الاعتماد",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "خطأ",
        "error"
      );
    }
  }

  async function markDebtPaid(
    id: string
  ) {
    if (debtLoading) {
      return;
    }

    const courier =
      couriers.find(
        (c) => c.id === id
      );

    const debt = Number(
      courier?.courier_debt || 0
    );

    if (debt <= 0) {
      toast(
        "لا يوجد دين مستحق على هذا المندوب",
        "success"
      );
      return;
    }

    const confirmed =
      window.confirm(
        `هل استلمت كامل الدين المستحق من المندوب؟\n\nالمبلغ: ${debt} دج\n\nسيتم تصفير الدين بالكامل.`
      );

    if (!confirmed) {
      return;
    }

    setDebtLoading(id);

    try {
      const response =
        await api<{
          ok: boolean;
          courier_debt: number;
        }>(
          `/admin/couriers/${id}/debt/paid`,
          {
            method: "PATCH",
          }
        );

      setCouriers(
        (current) =>
          current.map(
            (c) =>
              c.id === id
                ? {
                    ...c,
                    courier_debt:
                      Number(
                        response?.courier_debt ??
                          0
                      ),
                  }
                : c
          )
      );

      toast(
        "تم تسجيل استلام الدين وتصفيره",
        "success"
      );
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "تعذر تحديث الدين",
        "error"
      );
    } finally {
      setDebtLoading(null);
    }
  }

  async function viewIdCard(
    id: string
  ) {
    setIdCardLoading(true);

    try {
      const token =
        localStorage.getItem(
          "wassli_token"
        );

      const response =
        await fetch(
          `/api/admin/couriers/${id}/id-card`,
          {
            headers: {
              Authorization:
                token
                  ? `Bearer ${token}`
                  : "",
            },
          }
        );

      if (!response.ok) {
        let message =
          "تعذر تحميل بطاقة التعريف";

        try {
          const data =
            await response.json();

          if (data?.error) {
            message =
              data.error;
          }
        } catch {
          // تجاهل خطأ قراءة JSON
        }

        throw new Error(
          message
        );
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(
          blob
        );

      setIdCardUrl(
        (oldUrl) => {
          if (oldUrl) {
            URL.revokeObjectURL(
              oldUrl
            );
          }

          return url;
        }
      );
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
      URL.revokeObjectURL(
        idCardUrl
      );
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
        ).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() =>
                setTab(key)
              }
              className={`px-4 py-2 rounded-xl font-bold ${
                tab === key
                  ? "bg-green-600 text-white"
                  : "bg-white border"
              }`}
            >
              {label}
            </button>
          )
        )}

      </nav>

      <section className="max-w-5xl mx-auto p-4 space-y-4">

        {loading && (
          <LoadingState />
        )}

        {!loading && error && (
          <ErrorState
            message={error}
            onRetry={
              loadCurrentTab
            }
          />
        )}

        {!loading &&
          !error &&
          tab === "stats" &&
          stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

              <StatCard
                label="طلبات نشطة"
                value={Number(
                  stats.activeOrders ??
                    0
                )}
              />

              <StatCard
                label="مندوبون متصلون"
                value={Number(
                  stats.couriersOnline ??
                    0
                )}
              />

              <StatCard
                label="مندوبون معتمدون"
                value={Number(
                  stats.couriersApproved ??
                    stats.approvedCouriers ??
                    0
                )}
              />

              <StatCard
                label="بانتظار الاعتماد"
                value={Number(
                  stats.couriersPending ??
                    0
                )}
                accent="amber"
              />

              <StatCard
                label="إجمالي المستخدمين"
                value={Number(
                  stats.users ?? 0
                )}
              />

              <StatCard
                label="إجمالي الطلبات"
                value={Number(
                  stats.orders ?? 0
                )}
              />

              <StatCard
                label="الطلبات المكتملة"
                value={Number(
                  stats.completed ??
                    0
                )}
              />

              <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1">

                <div className="text-slate-500 text-sm">
                  إجمالي إيرادات الطلبات المكتملة
                </div>

                <div className="text-2xl font-black text-green-700">
                  {Number(
                    stats.revenue ?? 0
                  )}{" "}
                  دج
                </div>

              </div>

              {(
                stats.ordersByStatus ??
                []
              ).map((item) => (
                <StatCard
                  key={
                    item.status
                  }
                  label={
                    item.status
                  }
                  value={Number(
                    item.c ?? 0
                  )}
                />
              ))}

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

              {couriers.map(
                (courier) => {
                  const debt =
                    Number(
                      courier.courier_debt ||
                        0
                    );

                  const isApproved =
                    toBoolean(
                      courier.approved
                    );

                  const isOnline =
                    toBoolean(
                      courier.online
                    );

                  return (
                    <div
                      key={
                        courier.id
                      }
                      className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
                    >

                      <div className="flex justify-between items-start gap-3">

                        <div className="min-w-0">

                          <div className="font-bold text-slate-900">
                            {
                              courier.name
                            }
                          </div>

                          <div
                            className="text-sm text-slate-500 mt-1"
                            dir="ltr"
                          >
                            {
                              courier.phone
                            }
                          </div>

                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">

                          <span
                            className={`text-xs rounded-full px-2 py-1 font-bold ${
                              isApproved
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isApproved
                              ? "معتمد"
                              : "بانتظار الاعتماد"}
                          </span>

                          <span
                            className={`text-xs rounded-full px-2 py-1 ${
                              isOnline
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {isOnline
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
                                markDebtPaid(
                                  courier.id
                                )
                              }
                              disabled={
                                debtLoading ===
                                courier.id
                              }
                              className="bg-green-600 text-white rounded-xl px-4 py-3 font-bold text-sm disabled:opacity-50"
                            >
                              {debtLoading ===
                              courier.id
                                ? "جاري التسجيل..."
                                : "تم الاستلام"}
                            </button>
                          )}

                        </div>

                      </div>

                      <div
                        className={`rounded-xl p-3 text-sm ${
                          courier.has_id_card
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {courier.has_id_card
                          ? "✅ بطاقة التعريف مرفوعة"
                          : "❌ بطاقة التعريف غير موجودة"}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                        {courier.has_id_card && (
                          <button
                            onClick={() =>
                              viewIdCard(
                                courier.id
                              )
                            }
                            disabled={
                              idCardLoading
                            }
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
                              courier.id,
                              !isApproved
                            )
                          }
                          className={`w-full rounded-xl py-2 font-bold text-sm ${
                            isApproved
                              ? "bg-red-50 text-red-700"
                              : "bg-green-600 text-white"
                          }`}
                        >
                          {isApproved
                            ? "إلغاء الاعتماد"
                            : "اعتماد المندوب"}
                        </button>

                      </div>

                    </div>
                  );
                }
              )}

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
            orders.map(
              (order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                />
              )
            )
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
                users.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      className="p-3 flex justify-between items-center gap-3 text-sm"
                    >

                      <div className="min-w-0">

                        <div className="font-bold">
                          {
                            item.name
                          }
                        </div>

                        <div
                          className="text-slate-500 mt-1"
                          dir="ltr"
                        >
                          {
                            item.phone
                          }
                        </div>

                        {item.email && (
                          <div
                            className="text-xs text-slate-400 mt-1"
                            dir="ltr"
                          >
                            {
                              item.email
                            }
                          </div>
                        )}

                      </div>

                      <span className="text-slate-500 shrink-0">
                        {
                          item.role
                        }
                      </span>

                    </div>
                  )
                )
              )}

            </div>
          )}

        {!loading &&
          !error &&
          tab === "settings" &&
          settings && (
            <form
              onSubmit={
                saveSettings
              }
              className="bg-white rounded-2xl p-5 shadow-sm space-y-3"
            >

              {Object.entries(
                settings
              ).map(
                ([key, value]) => (
                  <div key={key}>

                    <label className="block text-sm text-slate-600 mb-1">
                      {key}
                    </label>

                    <input
                      className="w-full border rounded-xl p-3"
                      type="number"
                      value={value}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          [key]:
                            Number(
                              e.target.value
                            ),
                        })
                      }
                    />

                  </div>
                )
              )}

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
            complaints.map(
              (complaint) => (
                <ComplaintRow
                  key={
                    complaint.id
                  }
                  complaint={
                    complaint
                  }
                  onRespond={(
                    response
                  ) =>
                    respond(
                      complaint.id,
                      response
                    )
                  }
                />
              )
            )
          ))}

      </section>

      {idCardUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={
            closeIdCard
          }
        >

          <div
            className="relative bg-white rounded-2xl p-3 max-w-3xl max-h-[90vh] w-full shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <button
              onClick={
                closeIdCard
              }
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
  onRespond: (
    response: string
  ) => void;
}) {
  const [text, setText] =
    useState(
      complaint.response || ""
    );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">

      <p>
        {
          complaint.message
        }
      </p>

      <span className="text-xs text-slate-400">
        {complaint.status ===
        "pending"
          ? "قيد المراجعة"
          : "تم الرد"}
      </span>

      {complaint.status ===
      "pending" ? (
        <div className="flex gap-2">

          <input
            className="flex-1 border rounded-xl p-2"
            placeholder="الرد"
            value={text}
            onChange={(e) =>
              setText(
                e.target.value
              )
            }
          />

          <button
            onClick={() =>
              onRespond(text)
            }
            className="bg-green-600 text-white rounded-xl px-4"
          >
            إرسال
          </button>

        </div>
      ) : (
        <p className="text-sm text-green-700">
          الرد:{" "}
          {
            complaint.response
          }
        </p>
      )}

    </div>
  );
}
