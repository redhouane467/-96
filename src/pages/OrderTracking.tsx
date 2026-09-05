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
  const time = new Date(iso).getTime();

  if (!Number.isFinite(time)) {
    return "غير معروف";
  }

  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - time) / 1000)
  );

  if (diffSec < 60) {
    return `منذ ${diffSec} ثانية`;
  }

  const diffMin = Math.floor(diffSec / 60);

  if (diffMin < 60) {
    return `منذ ${diffMin} دقيقة`;
  }

  const diffHour = Math.floor(diffMin / 60);
  return `منذ ${diffHour} ساعة`;
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
      setError("");

      const ordersResponse = await api<{ orders?: Order[] }>("/orders");

      const orders = Array.isArray(ordersResponse?.orders)
        ? ordersResponse.orders
        : [];

      const foundOrder = orders.find(
        (item) => String(item?.id) === String(orderId)
      );

      if (!foundOrder) {
        setOrder(null);
        setError("الطلب غير موجود");
        return;
      }

      setOrder(foundOrder);

      try {
        const historyResponse = await api<{
          history?: OrderHistoryEntry[];
        }>(`/orders/${orderId}/timeline`);

        setHistory(
          Array.isArray(historyResponse?.history)
            ? historyResponse.history
            : []
        );
      } catch {
        setHistory([]);
      }

      if (foundOrder.status === "pending") {
        try {
          const response = await api<{ count?: number | null }>(
            `/orders/${orderId}/nearby-couriers-count`
          );

          setNearbyCount(
            typeof response?.count === "number"
              ? response.count
              : null
          );
        } catch {
          setNearbyCount(null);
        }
      } else {
        setNearbyCount(null);
      }
    } catch (e) {
      setOrder(null);
      setHistory([]);
      setError(
        e instanceof Error
          ? e.message
          : "تعذّر تحميل الطلب"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const isActive =
    order != null &&
    ACTIVE_STATUSES.includes(order.status);

  usePolling(load, 3000, isActive);

  if (loading) {
    return (
      <div className="p-4">
        <LoadingState label="جاري تحميل تتبع الطلب…" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error || "الطلب غير موجود"}
        </div>

        <button
          type="button"
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
    typeof order.pickup_lat === "number" &&
    typeof order.pickup_lng === "number"
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
    typeof order.delivery_lat === "number" &&
    typeof order.delivery_lng === "number"
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

  const courierUpdatedAt =
    order.courier?.location_updated_at;

  const courierLocationStale =
    !!courierUpdatedAt &&
    Date.now() -
      new Date(courierUpdatedAt).getTime() >
      LOCATION_STALE_MS;

  if (
    order.courier &&
    typeof order.courier.lat === "number" &&
    typeof order.courier.lng === "number" &&
    !courierLocationStale
  ) {
    markers.push({
      id: "courier",
      lat: order.courier.lat,
      lng: order.courier.lng,
      color: "#2563eb",
      emoji: "🛵",
      popupText: order.courier.name || "المندوب",
    });
  }

  const route: [number, number][] = [];

  if (
    typeof order.pickup_lat === "number" &&
    typeof order.pickup_lng === "number" &&
    typeof order.delivery_lat === "number" &&
    typeof order.delivery_lng === "number"
  ) {
    route.push(
      [order.pickup_lat, order.pickup_lng],
      [order.delivery_lat, order.delivery_lng]
    );
  }

  const firstMarker = markers[0];

  return (
    <div className="p-4 space-y-4">
      <button
        type="button"
        onClick={onClose}
        className="text-green-700 font-bold"
      >
        ‹ رجوع لطلباتي
      </button>

      {firstMarker && (
        <MapView
          markers={markers}
          routeCoords={route}
          center={[firstMarker.lat, firstMarker.lng]}
          height="220px"
        />
      )}

      {order.status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <div className="text-amber-800 font-bold">
            🔍 جاري البحث عن مندوب…
          </div>

          {nearbyCount !== null && (
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
          order.status === "completed" ||
          order.status === "delivered") && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                🛵 {order.courier.name || "المندوب"}
              </div>

              {order.courier.phone && (
                <div
                  className="text-sm text-slate-500"
                  dir="ltr"
                >
                  {order.courier.phone}
                </div>
              )}
            </div>

            <div className="text-left">
              {courierLocationStale ? (
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-1">
                  الموقع غير محدّث حاليًا
                </span>
              ) : courierUpdatedAt ? (
                <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-1">
                  آخر تحديث: {timeAgo(courierUpdatedAt)}
                </span>
              ) : (
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-1">
                  في انتظار الموقع
                </span>
              )}
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

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2 text-sm">
        {order.package_description && (
          <div>
            📦 {order.package_description}
          </div>
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
