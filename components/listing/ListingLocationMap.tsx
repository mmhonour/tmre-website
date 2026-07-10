"use client";

import { useEffect, useRef, useState } from "react";
import { HouseIcon } from "@/components/icons";

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;
const TILE_SIZE = 256;

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

/** Pixel offset of lat/lon within its OSM tile (0–256). */
function tilePixelPosition(
  latitude: number,
  longitude: number,
  zoom: number,
): { px: number; py: number } {
  const n = 2 ** zoom;
  const worldX = ((longitude + 180) / 360) * n * TILE_SIZE;
  const latRad = (latitude * Math.PI) / 180;
  const worldY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE_SIZE;
  return {
    px: worldX - Math.floor(worldX / TILE_SIZE) * TILE_SIZE,
    py: worldY - Math.floor(worldY / TILE_SIZE) * TILE_SIZE,
  };
}

/** Pan a cover-scaled tile so (px, py) sits at the container center. */
function centeredTileLayout(
  containerWidth: number,
  containerHeight: number,
  px: number,
  py: number,
): { width: number; height: number; left: number; top: number } {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { width: TILE_SIZE, height: TILE_SIZE, left: 0, top: 0 };
  }
  const scale = Math.max(containerWidth / TILE_SIZE, containerHeight / TILE_SIZE);
  const width = TILE_SIZE * scale;
  const height = TILE_SIZE * scale;
  return {
    width,
    height,
    left: containerWidth / 2 - px * scale,
    top: containerHeight / 2 - py * scale,
  };
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
  defaultZoom,
}: {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  className?: string;
  variant?: "compact" | "hero";
  hideLabel?: boolean;
  /** Spotlight: show map area without a property pin. */
  hidePin?: boolean;
  /** Initial zoom when coords load (e.g. town overview vs property). */
  defaultZoom?: number;
}) {
  const initialZoom = defaultZoom ?? DEFAULT_ZOOM;
  const [zoom, setZoom] = useState(initialZoom);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const lat = latitude != null ? Number(latitude) : null;
  const lon = longitude != null ? Number(longitude) : null;

  useEffect(() => {
    setZoom(initialZoom);
  }, [initialZoom, lat, lon]);

  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node) return;

    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      setContainerSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const coordsOk = hasValidCoords(lat, lon);
  const tilePixel =
    coordsOk && lat != null && lon != null
      ? tilePixelPosition(lat, lon, zoom)
      : null;
  const tileLayout =
    tilePixel && containerSize.width > 0
      ? centeredTileLayout(
          containerSize.width,
          containerSize.height,
          tilePixel.px,
          tilePixel.py,
        )
      : null;

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
          ref={mapContainerRef}
          className={`relative block overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] ${mapHeightClass}`}
          aria-label={`Map for ${addressQuery}`}
        >
          {tileLayout ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={zoom}
              src={mapPreviewUrl(lat, lon, zoom)}
              alt=""
              className="absolute max-w-none"
              style={{
                width: tileLayout.width,
                height: tileLayout.height,
                left: tileLayout.left,
                top: tileLayout.top,
              }}
              loading="lazy"
              draggable={false}
            />
          ) : null}
          {coordsOk && !hidePin ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-blue-600 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
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
