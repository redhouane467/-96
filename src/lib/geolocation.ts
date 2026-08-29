export type Coords = { lat: number; lng: number };

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error("تم رفض إذن الوصول للموقع"));
        else reject(new Error("تعذّر تحديد الموقع الحالي"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  });
}

// Returns an unsubscribe function. Calls onUpdate with each new position
// while active; calls onError once if geolocation is unavailable or the
// permission is denied.
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
    { enableHighAccuracy: true, maximumAge: 10000 }
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
