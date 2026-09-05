import { useState, useEffect, useRef } from "react";
import type { User } from "../types";
import { api } from "../lib/api";
import { watchPosition } from "../lib/geolocation";
import { useToast } from "../lib/toast";

interface Order {
  id: string;
  pickup_address: string;
  delivery_address: string;
  distance_km: number;
  final_price: number;
  status: string;
  package_description?: string;
  recipient_phone?: string;
  notes?: string;
  created_at: string;
}

interface Stats {
  completed: number;
  active: number;
  earnings: number;
  debt: number;
}

interface MeResponse {
  user?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role: string;
    approved: boolean | number | string;
    online: boolean | number | string;
    courier_debt?: number | string;
  };
}

interface OnlineResponse {
  user?: {
    id?: string;
    name?: string;
    approved: boolean | number | string;
    online: boolean | number | string;
    courier_debt?: number | string;
  };
}

const LOCATION_SEND_INTERVAL_MS = 5000;

function toBoolean(value: boolean | number | string | undefined) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

export default function CourierDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<
    "available" | "my_orders" | "stats"
  >("available");

  const [online, setOnline] = useState(false);
  const [approved, setApproved] = useState<boolean | null>(null);

  const [changingOnline, setChangingOnline] =
    useState(false);

  const toast = useToast();

  const lastSentRef = useRef(0);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const fetchMe = async () => {
    try {
      const response = await api<MeResponse>(
        "/auth/me"
      );

      const me = response.user;

      if (!me) {
        return;
      }

      const serverApproved = toBoolean(
        me.approved
      );

      const serverOnline = toBoolean(
        me.online
      );

      setApproved(serverApproved);
      setOnline(serverOnline);

      if (!serverApproved && serverOnline) {
        setOnline(false);
      }
    } catch {
      // تجاهل فشل تحديث بيانات المندوب
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await api<{
        orders?: Order[];
      }>("/orders");

      setOrders(
        Array.isArray(data.orders)
          ? data.orders
          : []
      );
    } catch {
      toast(
        "خطأ في تحميل الطلبات",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api<{
        stats?: {
          completed?: number | string;
          active?: number | string;
          earnings?: number | string;
          debt?: number | string;
        };
      }>("/courier/stats");

      const s = response.stats;

      if (!s) {
        setStats({
          completed: 0,
          active: 0,
          earnings: 0,
          debt: 0,
        });

        return;
      }

      setStats({
        completed: Number(
          s.completed ?? 0
        ),
        active: Number(
          s.active ?? 0
        ),
        earnings: Number(
          s.earnings ?? 0
        ),
        debt: Number(
          s.debt ?? 0
        ),
      });
    } catch {
      setStats({
        completed: 0,
        active: 0,
        earnings: 0,
        debt: 0,
      });
    }
  };

  useEffect(() => {
    fetchMe();
    fetchOrders();
    fetchStats();
  }, []);

  const hasActiveOrder = orders.some(
    (order) =>
      order.status === "accepted" ||
      order.status === "picked_up"
  );

  const toggleOnline = async () => {
    if (changingOnline) {
      return;
    }

    if (approved !== true) {
      toast(
        "حساب المندوب غير معتمد من الإدارة",
        "error"
      );

      return;
    }

    if (online && hasActiveOrder) {
      toast(
        "لا يمكنك إيقاف الاتصال أثناء وجود طلب قيد التوصيل",
        "error"
      );

      return;
    }

    const nextOnline = !online;

    setChangingOnline(true);

    try {
      const response =
        await api<OnlineResponse>(
          "/courier/online",
          {
            method: "POST",
            body: JSON.stringify({
              online: nextOnline,
            }),
          }
        );

      const serverUser =
        response.user;

      if (!serverUser) {
        throw new Error(
          "لم يرجع الخادم بيانات حالة الاتصال"
        );
      }

      const serverApproved =
        toBoolean(
          serverUser.approved
        );

      const serverOnline =
        toBoolean(
          serverUser.online
        );

      setApproved(
        serverApproved
      );

      setOnline(
        serverApproved
          ? serverOnline
          : false
      );

      if (!serverApproved) {
        toast(
          "حساب المندوب غير معتمد من الإدارة",
          "error"
        );

        return;
      }

      toast(
        serverOnline
          ? "أنت الآن متصل"
          : "أنت الآن غير متصل",
        "success"
      );
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء تغيير حالة الاتصال",
        "error"
      );

      await fetchMe();
    } finally {
      setChangingOnline(false);
    }
  };

  useEffect(() => {
    if (
      !online ||
      approved !== true ||
      !hasActiveOrder
    ) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      return;
    }

    lastSentRef.current = 0;

    stopWatchRef.current =
      watchPosition(
        (coords) => {
          const now =
            Date.now();

          if (
            now -
              lastSentRef.current <
            LOCATION_SEND_INTERVAL_MS
          ) {
            return;
          }

          lastSentRef.current =
            now;

          api(
            "/courier/location",
            {
              method: "POST",
              body: JSON.stringify(
                coords
              ),
            }
          ).catch(() => {});
        },
        (err) => {
          toast(
            err.message,
            "error"
          );
        }
      );

    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current =
        null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, approved, hasActiveOrder]);

  const handleAction = async (
    orderId: string,
    action:
      | "accept"
      | "pickup"
      | "deliver"
      | "unassign"
  ) => {
    if (
      action === "accept" &&
      approved !== true
    ) {
      toast(
        "حساب المندوب غير معتمد من الإدارة",
        "error"
      );

      return;
    }

    try {
      await api(
        `/orders/${orderId}/${action}`,
        {
          method: "POST",
        }
      );

      if (
        action === "deliver"
      ) {
        toast(
          "تم التوصيل للزبون وتسجيل الطلب كمكتمل",
          "success"
        );
      } else if (
        action === "accept"
      ) {
        toast(
          "تم قبول الطلب بنجاح",
          "success"
        );
      } else if (
        action === "pickup"
      ) {
        toast(
          "تم تسجيل استلام الشحنة",
          "success"
        );
      } else {
        toast(
          "تم إلغاء التكليف بنجاح",
          "success"
        );
      }

      await fetchOrders();
      await fetchStats();
      await fetchMe();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : "حدث خطأ ما",
        "error"
      );
    }
  };

  const availableOrders =
    orders.filter(
      (o) =>
        o.status === "pending"
    );

  const myOrders =
    orders.filter(
      (o) =>
        o.status !== "pending"
    );

  const currentDebt =
    Number(
      stats?.debt ?? 0
    );

  const totalRevenue =
    Number(
      stats?.earnings ?? 0
    );

  const appCommission =
    Math.round(
      totalRevenue *
        0.2 *
        100
    ) / 100;

  const courierEarnings =
    Math.round(
      totalRevenue *
        0.8 *
        100
    ) / 100;

  return (
    <div className="min-h-screen bg-gray-50 dir-rtl p-4 font-sans">

      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-4">

        <div>
          <h1 className="text-xl font-bold text-gray-800">
            مرحباً المندوب{" "}
            {user.name}
          </h1>

          <p className="text-sm text-gray-500">
            لوحة التحكم وإدارة الطلبات
          </p>
        </div>

        <button
          onClick={onLogout}
          className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          تأكيد الخروج
        </button>

      </div>

      {approved === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-4 text-center text-sm font-bold">
          ⏳ حسابك بانتظار اعتماد الإدارة — لن تتمكن من قبول الطلبات حتى تتم الموافقة
        </div>
      )}

      {approved === true && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 mb-4 text-center text-sm font-bold">
          ✅ حسابك معتمد من الإدارة
        </div>
      )}

      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm mb-4">

        <div>
          <p className="font-bold text-gray-800">
            حالتك
          </p>

          <p className="text-sm text-gray-500">
            {online
              ? "متصل — تظهر لك الطلبات القريبة"
              : "غير متصل"}
          </p>
        </div>

        <button
          onClick={
            toggleOnline
          }
          disabled={
            approved !== true ||
            changingOnline ||
            (online && hasActiveOrder)
          }
          className={`px-5 py-2 rounded-full font-bold text-sm transition disabled:opacity-40 ${
            online
              ? "bg-emerald-600 text-white"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {changingOnline
            ? "جاري التغيير..."
            : online
              ? "متصل ●"
              : "غير متصل"}
        </button>

      </div>

      <div className="flex gap-2 mb-4 bg-gray-200 p-1 rounded-xl">

        <button
          onClick={() =>
            setActiveTab(
              "available"
            )
          }
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
            activeTab ===
            "available"
              ? "bg-white text-emerald-600 shadow-sm"
              : "text-gray-600"
          }`}
        >
          الطلبات المتاحة (
          {
            availableOrders.length
          })
        </button>

        <button
          onClick={() =>
            setActiveTab(
              "my_orders"
            )
          }
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
            activeTab ===
            "my_orders"
              ? "bg-white text-emerald-600 shadow-sm"
              : "text-gray-600"
          }`}
        >
          طلباتي الحالية (
          {
            myOrders.length
          })
        </button>

        <button
          onClick={() =>
            setActiveTab(
              "stats"
            )
          }
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
            activeTab ===
            "stats"
              ? "bg-white text-emerald-600 shadow-sm"
              : "text-gray-600"
          }`}
        >
          الأرباح والعمولة 💰
        </button>

      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">
          جاري التحميل...
        </div>
      ) : activeTab ===
        "stats" ? (

        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-3">

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center">

              <span className="text-xs text-emerald-700 font-bold block">
                صافي أرباحك (80%)
              </span>

              <span className="text-2xl font-black text-emerald-700">
                {courierEarnings.toFixed(
                  2
                )}{" "}
                دج
              </span>

            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-center">

              <span className="text-xs text-red-700 font-bold block">
                عمولة التطبيق (20%)
              </span>

              <span className="text-2xl font-black text-red-700">
                {appCommission.toFixed(
                  2
                )}{" "}
                دج
              </span>

            </div>

          </div>

          <div
            className={`p-5 rounded-xl shadow-sm border text-center ${
              currentDebt > 0
                ? "bg-red-50 border-red-300"
                : "bg-emerald-50 border-emerald-300"
            }`}
          >

            <span
              className={`text-sm font-bold block ${
                currentDebt > 0
                  ? "text-red-700"
                  : "text-emerald-700"
              }`}
            >
              💳 المبلغ الواجب دفعه للتطبيق
            </span>

            <span
              className={`text-3xl font-black block mt-2 ${
                currentDebt > 0
                  ? "text-red-700"
                  : "text-emerald-700"
              }`}
            >
              {currentDebt.toFixed(
                2
              )}{" "}
              دج
            </span>

            <span
              className={`text-xs block mt-2 ${
                currentDebt > 0
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              {currentDebt > 0
                ? "هذا هو إجمالي العمولة المستحقة عليك للتطبيق"
                : "لا يوجد مبلغ مستحق عليك حالياً"}
            </span>

          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm text-center border">

            <span className="text-xs text-gray-500 font-bold block">
              إجمالي مبالغ الطلبات المكتملة
            </span>

            <span className="text-xl font-bold text-gray-800">
              {totalRevenue.toFixed(
                2
              )}{" "}
              دج
            </span>

            <span className="text-xs text-gray-400 block mt-1">
              عدد الطلبات المكتملة:{" "}
              {
                stats?.completed ??
                0
              }
            </span>

          </div>

        </div>

      ) : (

        <div className="space-y-3">

          {(activeTab ===
          "available"
            ? availableOrders
            : myOrders
          ).length === 0 ? (

            <div className="bg-white rounded-xl p-8 text-center text-gray-500 border">
              {activeTab ===
              "available"
                ? "لا توجد طلبات متاحة حالياً"
                : "لا توجد لديك طلبات حالية"}
            </div>

          ) : (

            (activeTab ===
            "available"
              ? availableOrders
              : myOrders
            ).map(
              (order) => (

                <div
                  key={order.id}
                  className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3"
                >

                  <div className="flex justify-between items-start">

                    <span className="text-xs font-bold text-gray-400">
                      مسافة{" "}
                      {
                        order.distance_km
                      }{" "}
                      كم
                    </span>

                    <span className="bg-emerald-100 text-emerald-800 font-black px-3 py-1 rounded-full text-sm">
                      {
                        order.final_price
                      }{" "}
                      دج
                    </span>

                  </div>

                  <div className="text-sm space-y-1">

                    <p>
                      <span className="font-bold text-gray-500">
                        📍 من:
                      </span>{" "}
                      {
                        order.pickup_address
                      }
                    </p>

                    <p>
                      <span className="font-bold text-gray-500">
                        🏁 إلى:
                      </span>{" "}
                      {
                        order.delivery_address
                      }
                    </p>

                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-1">

                    <p className="text-xs text-gray-500 font-bold">
                      📝 وصف الشحنة / تفاصيل الطلب:
                    </p>

                    <p className="text-sm font-semibold text-gray-800">
                      {
                        order.package_description ||
                        "لا يوجد وصف محدد"
                      }
                    </p>

                    {order.notes && (
                      <p className="text-xs text-amber-700 mt-1 font-medium">
                        ⚠️ ملاحظات:{" "}
                        {
                          order.notes
                        }
                      </p>
                    )}

                    {order.recipient_phone && (
                      <p className="text-xs text-blue-600 font-medium">
                        📞 هاتف المستلم:{" "}
                        {
                          order.recipient_phone
                        }
                      </p>
                    )}

                  </div>

                  <div className="pt-2 flex gap-2">

                    {order.status ===
                      "pending" && (

                      <button
                        onClick={() =>
                          handleAction(
                            order.id,
                            "accept"
                          )
                        }
                        disabled={
                          approved !==
                            true ||
                          changingOnline
                        }
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-40"
                      >
                        قبول الطلب
                      </button>

                    )}

                    {order.status ===
                      "accepted" && (

                      <>
                        <button
                          onClick={() =>
                            handleAction(
                              order.id,
                              "pickup"
                            )
                          }
                          className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm"
                        >
                          تم استلام الشحنة
                        </button>

                        <button
                          onClick={() =>
                            handleAction(
                              order.id,
                              "unassign"
                            )
                          }
                          className="bg-red-50 text-red-600 px-3 py-2 rounded-lg font-bold text-sm border border-red-200"
                        >
                          إلغاء التكليف
                        </button>
                      </>

                    )}

                    {order.status ===
                      "picked_up" && (

                      <button
                        onClick={() =>
                          handleAction(
                            order.id,
                            "deliver"
                          )
                        }
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm"
                      >
                        تم التوصيل للزبون
                      </button>

                    )}

                    {(order.status ===
                      "completed" ||
                      order.status ===
                        "delivered") && (

                      <span className="w-full text-center text-xs font-bold text-emerald-600 bg-emerald-50 py-2 rounded-lg">
                        ✅ تم التسليم بنجاح
                      </span>

                    )}

                  </div>

                </div>

              )
            )

          )}

        </div>

      )}

    </div>
  );
}
