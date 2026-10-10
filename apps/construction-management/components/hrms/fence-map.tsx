"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

/**
 * The map behind the fence picker (CM-304): OpenStreetMap tiles, a pin at
 * the fence centre and a circle of the fence radius. Tap or click the map
 * (or drag the pin) to move the centre. Loaded only in the browser
 * (`fence-map-picker.tsx` imports it with `next/dynamic`, no SSR); the
 * typed latitude and longitude beside it work without it.
 */

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** India, when there is no point yet. */
const INDIA: L.LatLngTuple = [21.1458, 79.0882];

export type FenceMapProps = {
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number | null;
  onPick: (point: { latitude: number; longitude: number }) => void;
};

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export default function FenceMap({
  latitude,
  longitude,
  radiusMetres,
  onPick,
}: FenceMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const pick = useRef(onPick);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (container.current == null) return;
    const created = L.map(container.current, {
      center: INDIA,
      zoom: 4,
      attributionControl: true,
    });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(
      created,
    );
    created.on("click", (event: L.LeafletMouseEvent) => {
      pick.current({
        latitude: round(event.latlng.lat),
        longitude: round(event.latlng.lng),
      });
    });
    map.current = created;
    return () => {
      created.remove();
      map.current = null;
      pin.current = null;
      circle.current = null;
    };
  }, []);

  useEffect(() => {
    const current = map.current;
    if (current == null) return;
    if (latitude == null || longitude == null) {
      pin.current?.remove();
      circle.current?.remove();
      pin.current = null;
      circle.current = null;
      return;
    }
    const centre: L.LatLngTuple = [latitude, longitude];
    const radius = radiusMetres ?? 0;
    if (pin.current == null) {
      pin.current = L.marker(centre, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: '<span class="block size-4 rounded-full border-2 border-white bg-primary shadow-md"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(current);
      pin.current.on("dragend", () => {
        const at = pin.current?.getLatLng();
        if (at != null)
          pick.current({ latitude: round(at.lat), longitude: round(at.lng) });
      });
    } else pin.current.setLatLng(centre);
    if (circle.current == null)
      circle.current = L.circle(centre, {
        radius,
        className: "stroke-primary fill-primary",
        weight: 2,
        fillOpacity: 0.15,
      }).addTo(current);
    else {
      circle.current.setLatLng(centre);
      circle.current.setRadius(radius);
    }
    // Keep the whole fence in view.
    if (radius > 0)
      current.fitBounds(circle.current.getBounds(), {
        padding: [24, 24],
        maxZoom: 18,
      });
    else current.setView(centre, Math.max(current.getZoom(), 16));
  }, [latitude, longitude, radiusMetres]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Map. Tap to place the fence centre."
      className="isolate h-64 w-full overflow-hidden rounded-lg border sm:h-72"
    />
  );
}
