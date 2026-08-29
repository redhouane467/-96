import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function buildIcon(color: string, emoji?: string) {
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
}

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

  // 1. Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Center map when `center` prop explicitly changes (e.g., when clicking "Find My Location")
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.setView(center, zoom, { animate: true });
    map.invalidateSize();
  }, [center, zoom]);

  // 3. Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const icon = buildIcon(m.color || "#16a34a", m.emoji);
      const existing = markersRef.current.get(m.id);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        existing.setIcon(icon);
        if (m.popupText) existing.bindPopup(m.popupText);
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
      if (markers.length === 1 && !center) {
        map.setView([markers[0].lat, markers[0].lng], zoom);
      } else if (markers.length > 1) {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }
  }, [markers, zoom, center]);

  // 4. Sync route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
