export type Coords = { lat: number; lng: number };

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع"));
      return;
    }

    // فحص ما إذا كان الموقع يعمل عبر اتصال غير آمن (HTTPS)
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      reject(new Error("خدمة الموقع تتطلب الاتصال عبر رابط آمن (HTTPS)"));
      return;
    }

    // المحاولة الأولى: دقة عادية وسريعة لضمان الاستجابة
    const options: PositionOptions = {
      enableHighAccuracy: false, // الاستعانة برجال التغطية والـ Wi-Fi لسرعة الاستجابة
      timeout: 15000,
      maximumAge: 30000,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("تم رفض إذن الوصول للموقع من المتصفح"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("انتهت مهلة تحديد الموقع، يرجى تفعيل الـ GPS والتأكد من الاتصال"));
        } else {
          reject(new Error("تعذّر تحديد الموقع الحالي، يمكنك تحديده على الخريطة"));
        }
      },
      options
    );
  });
}

export function watchPosition(onUpdate: (c: Coords) => void, onError?: (e: Error) => void): () => void {
  if (!("geolocation" in navigator)) {
    onError?.(new Error("المتصفح لا يدعم تحديد الموقع"));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) onError?.(new Error("تم رفض إذن الوصول للموقع"));
      else onError?.(new Error("تعذّر تتبع الموقع"));
    },
    { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
