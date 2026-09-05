import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import type { Order, OrderHistoryEntry } from "../types";
import Timeline from "../components/Timeline";
import MapView from "../components/MapView";
import type { MapMarker } from "../components/MapView";
import { LoadingState } from "../components/States";

const ACTIVE_STATUSES = ["pending", "accepted", "picked_up"];
const LOCATION_STALE_MS = 90_000;

function timeAgo(iso: string) {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  );

  if (diffSec < 60) return `منذ ${diffSec} ثانية`;

  const diffMin = Math.floor(diffSec / 60);
  return `منذ ${diffMin} دقيقة`;
}

export default function OrderTracking({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      /*
       * لا نستخدم /orders/:id لأن الـBackend الحالي يرجع
       * الطلبات من /orders فقط.
       */
      const [ordersRes, historyRes] = await Promise.all([
        api<{ orders: Order[] }>("/orders"),
        api<{ history: OrderHistoryEntry[] }>(
          `/orders/${orderId}/timeline`
        ),
      ]);

      const foundOrder = ordersRes.orders.find(
        (item) => String(item.id) === String(orderId)
      );

      if (!foundOrder) {
        throw new Error("الطلب غير موجود");
      }

      setOrder(foundOrder);
      setHistory(historyRes.history);
      setError("");

      if (foundOrder.status === "pending") {
        try {
          const nc = await api<{ count: number | null }>(
            `/orders/${orderId}/nearby-couriers-count`
          );

          setNearbyCount(nc.count);
        } catch {
          // غير مهم إذا فشل عدّ المندوبين القريبين
        }
      } else {
        setNearbyCount(null);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "تعذّر تحميل الطلب"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const isActive = order
    ? ACTIVE_STATUSES.includes(order.status)
    : true;

  usePolling(load, 3000, isActive);

  if (loading) {
    return <LoadingState label="جاري تحميل تتبع الطلب…" />;
  }

  if (error || !order) {
    return (
      <div className="space-y-3">
        <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">
          {error || "الطلب غير موجود"}
        </div>

        <button
          onClick={onClose}
          className="text-green-700 font-bold"
        >
          ‹ رجوع
        </button>
      </div>
    );
  }

  const markers: MapMarker[] = [];

  if (
    order.pickup_lat != null &&
    order.pickup_lng != null
  ) {
    markers.push({
      id: "pickup",
      lat: order.pickup_lat,
      lng: order.pickup_lng,
      color: "#16a34a",
      emoji: "📦",
      popupText: "نقطة الاستلام",
    });
  }

  if (
    order.delivery_lat != null &&
    order.delivery_lng != null
  ) {
    markers.push({
      id: "delivery",
      lat: order.delivery_lat,
      lng: order.delivery_lng,
      color: "#dc2626",
      emoji: "🏁",
      popupText: "نقطة التسليم",
    });
  }

  const courierLocationStale =
    !!order.courier?.location_updated_at &&
    Date.now() -
      new Date(order.courier.location_updated_at).getTime() >
      LOCATION_STALE_MS;

  if (
    order.courier?.lat != null &&
    order.courier?.lng != null &&
    !courierLocationStale
  ) {
    markers.push({
      id: "courier",
      lat: order.courier.lat,
      lng: order.courier.lng,
      color: "#2563eb",
      emoji: "🛵",
      popupText: order.courier.name,
    });
  }

  const route: [number, number][] =
    order.pickup_lat != null &&
    order.pickup_lng != null &&
    order.delivery_lat != null &&
    order.delivery_lng != null
      ? [
          [order.pickup_lat, order.pickup_lng],
          [order.delivery_lat, order.delivery_lng],
        ]
      : [];

  return (
    <div className="space-y-4">
      <button
        onClick={onClose}
        className="text-green-700 font-bold"
      >
        ‹ رجوع لطلباتي
      </button>

      {markers.length > 0 && (
        <MapView
          markers={markers}
          routeCoords={route}
          center={[markers[0].lat, markers[0].lng]}
          height="220px"
        />
      )}

      {order.status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <div className="animate-pulse text-amber-800 font-bold">
            🔍 جاري البحث عن مندوب…
          </div>

          {nearbyCount != null && (
            <div className="text-sm text-amber-700 mt-1">
              {nearbyCount > 0
                ? `${nearbyCount} مندوب متاح قريب من موقعك`
                : "لا يوجد مندوبون متاحون قريبًا حاليًا"}
            </div>
          )}
        </div>
      )}

      {order.courier &&
        (order.status === "accepted" ||
          order.status === "picked_up" ||
          order.status === "completed") && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-900">
                🛵 {order.courier.name}
              </div>

              <div
                className="text-sm text-slate-500"
                dir="ltr"
              >
                {order.courier.phone}
              </div>
            </div>

            <div className="text-left">
              {courierLocationStale ? (
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-1">
                  الموقع غير محدّث حاليًا
                </span>
              ) : order.courier.location_updated_at ? (
                <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-1">
                  آخر تحديث:{" "}
                  {timeAgo(
                    order.courier.location_updated_at
                  )}
                </span>
              ) : null}
            </div>
          </div>
        )}

      <Timeline
        status={order.status}
        history={history}
      />

      {order.status === "accepted" &&
        order.confirmation_code && (
          <div className="bg-amber-50 text-amber-800 rounded-xl p-3 text-sm text-center">
            أعطِ المندوب رمز التأكيد عند الاستلام:{" "}
            <b className="text-lg">
              {order.confirmation_code}
            </b>
          </div>
        )}

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-1 text-sm">
        {order.package_description && (
          <div>📦 {order.package_description}</div>
        )}

        {order.recipient_phone && (
          <div
            dir="ltr"
            className="text-right"
          >
            📞 {order.recipient_phone}
          </div>
        )}

        {order.notes && (
          <div className="text-slate-500">
            📝 {order.notes}
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <b className="text-green-700 text-lg">
            {order.final_price} دج
          </b>

          <span className="text-xs text-slate-400">
            {order.distance_km} كم
          </span>
        </div>
      </div>
    </div>
  );
}
