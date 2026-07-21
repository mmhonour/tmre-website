"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { HouseIcon } from "@/components/icons";
import {
  isTmreTown,
  zipsForTown,
  type TmreTown,
} from "@/lib/tmre-towns";

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;
const TILE_SIZE = 256;

type Coord = [number, number];
type Ring = Coord[];

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

/**
 * Cover-scale a tile and pan so (px, py) sits at the container center.
 * Do not clamp to fill the frame — clamping used to shift the geographic
 * point away from center while the pin stayed fixed, so the house looked wrong.
 * Near tile edges you may see a narrow empty band; the pin stays on the house.
 */
function centeredTileLayout(
  containerWidth: number,
  containerHeight: number,
  px: number,
  py: number,
): { width: number; height: number; left: number; top: number } | null {
  if (containerWidth <= 0 || containerHeight <= 0) return null;
  const scale = Math.max(
    containerWidth / TILE_SIZE,
    containerHeight / TILE_SIZE,
  );
  const width = TILE_SIZE * scale;
  const height = TILE_SIZE * scale;
  const left = containerWidth / 2 - px * scale;
  const top = containerHeight / 2 - py * scale;
  return { width, height, left, top };
}

function projectTownRings(
  rings: Ring[],
  w: number,
  h: number,
  pad = 18,
): { paths: string[]; cx: number; cy: number } | null {
  if (rings.length === 0 || w <= 0 || h <= 0) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const scaleX = (w - pad * 2) / (maxLon - minLon || 1);
  const scaleY = (h - pad * 2) / (maxLat - minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = pad + ((w - pad * 2) - (maxLon - minLon) * scale) / 2;
  const offsetY = pad + ((h - pad * 2) - (maxLat - minLat) * scale) / 2;

  const toSvg = ([lon, lat]: Coord): string => {
    const x = offsetX + (lon - minLon) * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const paths = rings.map((ring) => {
    const pts = ring.map(toSvg);
    return `M ${pts.join(" L ")} Z`;
  });

  return {
    paths,
    cx: offsetX + ((minLon + maxLon) / 2 - minLon) * scale,
    cy: offsetY + (maxLat - (minLat + maxLat) / 2) * scale,
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

function TownOutlineOverlay({
  town,
  width,
  height,
}: {
  town: TmreTown;
  width: number;
  height: number;
}) {
  const patternId = useId().replace(/:/g, "");
  const [rings, setRings] = useState<Ring[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const zips = [...zipsForTown(town)];
    setStatus("loading");
    setRings(null);

    fetch(`/api/zip-boundaries?zips=${zips.join(",")}`, { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { boundaries?: Record<string, Ring[]>; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const all: Ring[] = [];
        for (const zip of zips) {
          const zipRings = data.boundaries?.[zip];
          if (Array.isArray(zipRings)) all.push(...zipRings);
        }
        if (all.length === 0) {
          setStatus("error");
          return;
        }
        setRings(all);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [town]);

  const projected = useMemo(
    () => (rings && width > 0 && height > 0 ? projectTownRings(rings, width, height) : null),
    [rings, width, height],
  );

  if (status === "loading") {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy/55 backdrop-blur-[1px]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
      </div>
    );
  }

  if (status === "error" || !projected) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy/60">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gold/70 font-mono text-xl font-semibold text-gold"
          aria-hidden
        >
          ?
        </span>
        <span className="sr-only">Town location approximate</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0"
      >
        <defs>
          <pattern
            id={`town-dot-${patternId}`}
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.55" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>
        <rect
          width={width}
          height={height}
          fill={`url(#town-dot-${patternId})`}
          className="opacity-90"
        />
        {projected.paths.map((d, i) => (
          <path
            key={`fill-${i}`}
            d={d}
            fill="rgba(212,175,55,0.14)"
          />
        ))}
        {projected.paths.map((d, i) => (
          <path
            key={`stroke-${i}`}
            d={d}
            fill="none"
            stroke="#D4AF37"
            strokeWidth="2.25"
            strokeLinejoin="round"
          />
        ))}
        <circle
          cx={projected.cx}
          cy={projected.cy}
          r="14"
          fill="rgba(27,42,74,0.88)"
          stroke="#D4AF37"
          strokeWidth="1.75"
        />
        <text
          x={projected.cx}
          y={projected.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#D4AF37"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="18"
          fontWeight="600"
        >
          ?
        </text>
      </svg>
      <span className="sr-only">{`${town} — exact address hidden`}</span>
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
  outlineTown = null,
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
  /** Spotlight privacy: outline this TMRE town with a ? marker. */
  outlineTown?: string | null;
  /** Initial zoom when coords load (e.g. town overview vs property). */
  defaultZoom?: number;
}) {
  const initialZoom = defaultZoom ?? DEFAULT_ZOOM;
  const [zoom, setZoom] = useState(initialZoom);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const lat = latitude != null ? Number(latitude) : null;
  const lon = longitude != null ? Number(longitude) : null;
  const resolvedOutlineTown =
    outlineTown && isTmreTown(outlineTown) ? outlineTown : null;
  const showTownMystery = Boolean(resolvedOutlineTown);

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
  }, [variant, lat, lon, showTownMystery]);

  const coordsOk = hasValidCoords(lat, lon);
  const tilePixel =
    coordsOk && lat != null && lon != null
      ? tilePixelPosition(lat, lon, zoom)
      : null;
  const tileLayout =
    tilePixel != null
      ? centeredTileLayout(
          containerSize.width,
          containerSize.height,
          tilePixel.px,
          tilePixel.py,
        )
      : null;

  // Pin must follow the lat/lon on the scaled tile — not the container center.
  const pinPosition =
    tileLayout && tilePixel
      ? {
          left: tileLayout.left + tilePixel.px * (tileLayout.width / TILE_SIZE),
          top: tileLayout.top + tilePixel.py * (tileLayout.height / TILE_SIZE),
        }
      : null;

  const isHero = variant === "hero";
  // Hero: fill the parent shell (absolute inset-0 from ListingHeroPanels).
  // Compact: fixed strip height.
  const mapFrameClass = isHero
    ? "absolute inset-0 w-full h-full"
    : "relative w-full h-20 sm:h-[5.5rem]";

  const showMapFrame = coordsOk || showTownMystery;

  return (
    <div
      className={`min-h-0 ${
        isHero ? "relative h-full w-full" : "flex flex-col gap-2"
      } ${className}`}
    >
      {!hideLabel ? (
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold">
          Location
        </p>
      ) : null}

      {showMapFrame ? (
        <div
          ref={mapContainerRef}
          className={`overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] ${mapFrameClass}`}
          aria-label={
            showTownMystery
              ? `Approximate location in ${resolvedOutlineTown}`
              : `Map for ${addressQuery}`
          }
        >
          {coordsOk && lat != null && lon != null && tileLayout ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={zoom}
              src={mapPreviewUrl(lat, lon, zoom)}
              alt=""
              className={`absolute max-w-none ${
                showTownMystery ? "opacity-35 saturate-50" : ""
              }`}
              style={{
                width: tileLayout.width,
                height: tileLayout.height,
                left: tileLayout.left,
                top: tileLayout.top,
              }}
              loading="lazy"
              draggable={false}
            />
          ) : showTownMystery ? (
            <div className="absolute inset-0 bg-[#152238]" aria-hidden />
          ) : null}

          {showTownMystery && resolvedOutlineTown ? (
            <TownOutlineOverlay
              town={resolvedOutlineTown}
              width={containerSize.width}
              height={containerSize.height}
            />
          ) : null}

          {pinPosition && !hidePin && !showTownMystery ? (
            <span
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-blue-600 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
              style={{ left: pinPosition.left, top: pinPosition.top }}
              aria-hidden
            >
              <HouseIcon className="h-5 w-5" />
            </span>
          ) : null}

          {!showTownMystery ? (
            <MapZoomControls
              zoom={zoom}
              onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
              onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
            />
          ) : null}
        </div>
      ) : (
        <div
          className={`flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-2 text-center ${
            isHero
              ? "absolute inset-0 w-full h-full"
              : "relative w-full h-20 sm:h-[5.5rem]"
          }`}
        >
          <span className="font-mono text-[8px] leading-snug tracking-[0.1em] uppercase text-white/50">
            Map unavailable
          </span>
        </div>
      )}
    </div>
  );
}
