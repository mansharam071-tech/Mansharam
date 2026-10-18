import { useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

const TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = "&copy; OpenStreetMap contributors";

const pin = (color, label) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 12px Inter">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const Fit = ({ points }) => {
  const map = useMap();
  const key = JSON.stringify(points.map((p) => [p.lat.toFixed(3), p.lng.toFixed(3)]));
  useEffect(() => {
    const valid = points.filter(Boolean);
    if (valid.length > 1) map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [50, 50], maxZoom: 15 });
    else if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
};

export const TrackMap = ({ dest, partner, className = "h-full", testid }) => {
  const pts = [dest, partner].filter(Boolean);
  if (!pts.length) return <div className={`${className} bg-slate-200`} />;
  return (
    <div data-testid={testid} className={className}>
      <MapContainer center={[pts[0].lat, pts[0].lng]} zoom={14} className="h-full w-full" zoomControl={false}>
        <TileLayer url={TILE} attribution={ATTR} />
        {dest && <Marker position={[dest.lat, dest.lng]} icon={pin("#1E3A8A", "H")} />}
        {partner && <Marker position={[partner.lat, partner.lng]} icon={pin("#F59E0B", "P")} />}
        {dest && partner && (
          <Polyline positions={[[partner.lat, partner.lng], [dest.lat, dest.lng]]} pathOptions={{ color: "#1E3A8A", dashArray: "6 8", weight: 4 }} />
        )}
        <Fit points={pts} />
      </MapContainer>
    </div>
  );
};

const Clicker = ({ onAdd }) => {
  useMapEvents({ click: (e) => onAdd([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))]) });
  return null;
};

const Recenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], 11);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);
  return null;
};

export const GeofenceMap = ({ polygon, onChange, center, others = [], testid }) => {
  const [hover] = useState(null);
  const c = center || { lat: 26.8467, lng: 80.9462 };
  return (
    <div data-testid={testid} className="h-full w-full">
      <MapContainer center={[c.lat, c.lng]} zoom={11} className="h-full w-full">
        <TileLayer url={TILE} attribution={ATTR} />
        <Recenter center={center} />
        {others.map((o, i) => o.length > 2 && <Polygon key={i} positions={o} pathOptions={{ color: "#94A3B8", weight: 1, fillOpacity: 0.08 }} />)}
        {polygon.length > 2 && <Polygon positions={polygon} pathOptions={{ color: "#1E3A8A", fillColor: "#F59E0B", fillOpacity: 0.25, weight: 3 }} />}
        {polygon.length === 2 && <Polyline positions={polygon} pathOptions={{ color: "#1E3A8A", weight: 3 }} />}
        {polygon.map((p, i) => (
          <Marker key={i} position={p} icon={pin(i === 0 ? "#22C55E" : "#1E3A8A", i + 1)} />
        ))}
        <Clicker onAdd={(p) => onChange([...polygon, p])} />
        {hover}
      </MapContainer>
    </div>
  );
};
