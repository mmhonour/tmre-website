"use client";

import { useState } from "react";
import { HouseIcon } from "@/components/icons";

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

function hasValidCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  const lat = latitude != null ? Number(latitude) : null;
  const lon = longitude != null ? Number(longitude) : null;
  return (
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
}

function mapPreviewUrl(latitude: number, longitude: number, zoom: number): string {
  return `/api/map/preview?lat=${latitude}&lon=${longitude}&z=${zoom}`;
}

function markerPosition(
  latitude: number,
  longitude: number,
  zoom: number,
): { left: string; top: string } {
  const n = 2 ** zoom;
  const worldX = ((longitude + 180) / 360) * n * 256;
  const latRad = (latitude * Math.PI) / 180;
  const worldY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  const px = worldX - Math.floor(worldX / 256) * 256;
  const py = worldY - Math.floor(worldY / 256) * 256;
  return { left: `${(px / 256) * 100}%`, top: `${(py / 256) * 100}%` };
}

function MapZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="absolute right-2 top-2 z-20 flex flex-col overflow-hidden rounded-md border border-white/15 bg-navy/80 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        className="flex h-7 w-7 items-center justify-center font-mono text-sm leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
      <div className="h-px bg-white/10" aria-hidden />
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        className="flex h-7 w-7 items-center justify-center font-mono text-sm leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
    </div>
  );
}

export default function ListingLocationMap({
  latitude,
  longitude,
  addressQuery,
  className = "",
  variant = "compact",
  hideLabel = false,
  hidePin = false,
}: {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  className?: string;
  variant?: "compact" | "hero";
  hideLabel?: boolean;
  /** Spotlight: show map area without a property pin. */
  hidePin?: boolean;
}) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const lat = latitude != null ? Number(latitude) : null;
  const lon = longitude != null ? Number(longitude) : null;
  const coordsOk = hasValidCoords(lat, lon);
  const pin =
    coordsOk && lat != null && lon != null ? markerPosition(lat, lon, zoom) : null;
  const isHero = variant === "hero";
  const mapHeightClass = isHero
    ? "h-full min-h-[10rem] lg:min-h-[12rem]"
    : "h-20 sm:h-[5.5rem]";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {!hideLabel ? (
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold">
          Location
        </p>
      ) : null}

      {coordsOk && lat != null && lon != null ? (
        <div
          className={`relative block overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] ${mapHeightClass}`}
          aria-label={`Map for ${addressQuery}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={zoom}
            src={mapPreviewUrl(lat, lon, zoom)}
            alt=""
            className="block h-full w-full object-cover"
            loading="lazy"
          />
          {pin && !hidePin ? (
            <span
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-blue-600 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
              style={{ left: pin.left, top: pin.top }}
              aria-hidden
            >
              <HouseIcon className="h-5 w-5" />
            </span>
          ) : null}
          <MapZoomControls
            zoom={zoom}
            onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
            onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-2 text-center ${mapHeightClass}`}
        >
          <span className="font-mono text-[8px] leading-snug tracking-[0.1em] uppercase text-white/50">
            Map unavailable
          </span>
        </div>
      )}
    </div>
  );
}
