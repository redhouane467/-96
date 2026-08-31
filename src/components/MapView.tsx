import { useEffect, useRef } from "react";
import type * as L from "leaflet"; // Import types only to avoid SSR issues with `window`
import "leaflet/dist/leaflet.css"; // CSS import is typically fine for SSR

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  emoji?: string;
  popupText?: string;
};

type MapViewProps = {
  markers: MapMarker[];
  routeCoords?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
  center?: [number, number];
  zoom?: number;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [36.7538, 3.0588]; // Algiers

export default function MapView({
  markers,
  routeCoords,
  onMapClick,
  height = "260px",
  center,
  zoom = 13,
  className = "",
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeRef = useRef<L.Polyline | null>(null);
  const lastMarkerIdsRef = useRef<string>("");
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  // Ref to store the dynamically loaded Leaflet module
  const LRef = useRef<typeof L | null>(null);

  // Helper function for icon building, now depends on LRef.current being available
  const buildIcon = (color: string, emoji?: string) => {
    const L = LRef.current;
    if (!L) return undefined; // Return undefined if Leaflet isn't loaded yet
    
    return L.divIcon({
      className: "",
      html: `<div style="
        width:34px;height:34px;border-radius:50% 50% 50% 0;
        background:${color};transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;
      "><span style="transform:rotate(45deg);font-size:16px;line-height:1">${emoji || ""}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32],
    });
  };

  // 1. Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet only on the client side to avoid SSR issues
    import("leaflet")
      .then((leafletModule) => {
        LRef.current = leafletModule; // Store Leaflet module in ref
        const L = LRef.current; // Alias for convenience

        const initialCenter = center || (markers[0] ? [markers[0].lat, markers[0].lng] : DEFAULT_CENTER);
        const map = L.map(containerRef.current, { zoomControl: true }).setView(initialCenter, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (e: L.LeafletMouseEvent) => onClickRef.current?.(e.latlng.lat, e.latlng.lng));
        mapRef.current = map;

        // Fix gray tiles / bad container rendering
        setTimeout(() => {
          map.invalidateSize();
        }, 200);

        return () => {
          map.remove();
          mapRef.current = null;
          markersRef.current.clear();
          routeRef.current = null;
          LRef.current = null; // Clear Leaflet ref on unmount
        };
      })
      .catch((error) => console.error("Failed to load Leaflet:", error));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this effect runs only once after mount

  // 2. Center map when `center` prop explicitly changes (e.g., when clicking "Find My Location")
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !center) return; // Ensure Leaflet is loaded
    map.setView(center, zoom, { animate: true });
    map.invalidateSize();
  }, [center, zoom]);

  // 3. Sync markers
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return; // Ensure Leaflet is loaded

    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const icon = buildIcon(m.color || "#16a34a", m.emoji);
      if (!icon) continue; // Skip if icon couldn't be built (L not ready)

      const existing = markersRef.current.get(m.id);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        existing.setIcon(icon);
        if (m.popupText) existing.bindPopup(m.popupText);
        else existing.unbindPopup(); // Unbind if popupText is removed
      } else {
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        if (m.popupText) marker.bindPopup(m.popupText);
        markersRef.current.set(m.id, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    const idsKey = [...seen].sort().join(",");
    if (idsKey !== lastMarkerIdsRef.current) {
      lastMarkerIdsRef.current = idsKey;
      // Only fit bounds if `center` is not explicitly set, as `center` takes precedence
      if (markers.length === 1 && !center) {
        map.setView([markers[0].lat, markers[0].lng], zoom);
      } else if (markers.length > 1 && !center) { // Added !center check here
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }
  }, [markers, zoom, center]);

  // 4. Sync route line
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return; // Ensure Leaflet is loaded

    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }
    if (routeCoords && routeCoords.length > 1) {
      routeRef.current = L.polyline(routeCoords, {
        color: "#16a34a",
        weight: 4,
        opacity: 0.8,
        dashArray: "6 6",
      }).addTo(map);
    }
  }, [routeCoords]);

  return <div ref={containerRef} className={`rounded-2xl overflow-hidden ${className}`} style={{ height, width: "100%" }} />;
}