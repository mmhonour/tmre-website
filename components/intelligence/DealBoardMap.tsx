"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Multi-pin map for the Intelligence deal board.
 *
 * Shares the tile source and Web-Mercator math with ListingLocationMap but not
 * its geometry: that component centres one pin in the panel, while this one
 * holds a viewport (centre + zoom) and projects every filtered listing into it.
 * Tiles come from /api/map/tile, so there is no third-party map SDK or key.
 */

const TILE_SIZE = 256;
const MIN_ZOOM = 9;
const MAX_ZOOM = 17;
/** Fairfield County fallback when no listing in the board has coordinates. */
const FALLBACK_CENTER = { lat: 41.141, lon: -73.3579 };
const FALLBACK_ZOOM = 11;

export type DealBoardMapListing = {
  key: string;
  address: string;
  city?: string | null;
  price: number;
  score: number;
  isRental: boolean;
  beds?: number | null;
  baths?: number | null;
  sqft: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type LonLat = { lat: number; lon: number };

type PlacedPin = {
  listing: DealBoardMapListing;
  left: number;
  top: number;
};

function tileUrl(z: number, x: number, y: number): string {
  return `/api/map/tile/${z}/${x}/${y}`;
}

function worldSize(zoom: number): number {
  return 2 ** zoom * TILE_SIZE;
}

function lonToWorldX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * worldSize(zoom);
}

function latToWorldY(lat: number, zoom: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    worldSize(zoom)
  );
}

function worldToLonLat(x: number, y: number, zoom: number): LonLat {
  const size = worldSize(zoom);
  const lon = (x / size) * 360 - 180;
  const ny = 1 - (2 * y) / size;
  const lat = (Math.atan(Math.sinh(Math.PI * ny)) * 180) / Math.PI;
  return { lat, lon };
}

function hasCoords(
  l: DealBoardMapListing,
): l is DealBoardMapListing & { latitude: number; longitude: number } {
  const lat = l.latitude;
  const lon = l.longitude;
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
}

/** Compact money for a pin label: 1250000 -> $1.25M, 7200 -> $7.2K. */
function pinPriceLabel(price: number, isRental: boolean): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  if (isRental) return `$${Math.round(price / 100) / 10}K`.replace(".0K", "K");
  if (price >= 1_000_000) {
    const m = Math.round(price / 10_000) / 100;
    return `$${m}M`;
  }
  return `$${Math.round(price / 1000)}K`;
}

/**
 * Zoom that fits `pins` in a w×h panel, and the centre of their bounds. A single
 * pin (or a cluster inside one block) has no meaningful span, so it gets a
 * street-level default rather than MAX_ZOOM.
 */
function fitViewport(
  pins: readonly (DealBoardMapListing & { latitude: number; longitude: number })[],
  width: number,
  height: number,
): { center: LonLat; zoom: number } {
  if (pins.length === 0 || width <= 0 || height <= 0) {
    return { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const pin of pins) {
    if (pin.latitude < minLat) minLat = pin.latitude;
    if (pin.latitude > maxLat) maxLat = pin.latitude;
    if (pin.longitude < minLon) minLon = pin.longitude;
    if (pin.longitude > maxLon) maxLon = pin.longitude;
  }

  const center = {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };

  // Leave room for pin labels, which hang above and to the right of the anchor.
  const padded = { w: Math.max(64, width - 96), h: Math.max(64, height - 96) };
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom--) {
    const spanX =
      lonToWorldX(maxLon, zoom) - lonToWorldX(minLon, zoom);
    const spanY = latToWorldY(minLat, zoom) - latToWorldY(maxLat, zoom);
    if (spanX <= padded.w && spanY <= padded.h) {
      return { center, zoom: pins.length === 1 ? Math.min(zoom, 15) : zoom };
    }
  }
  return { center, zoom: MIN_ZOOM };
}

function MapControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="absolute left-2 top-2 z-20 flex flex-col overflow-hidden rounded-md border border-white/15 bg-navy/80 shadow-lg backdrop-blur-sm">
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
      <div className="h-px bg-white/10" aria-hidden />
      <button
        type="button"
        onClick={onFit}
        aria-label="Fit all listings"
        title="Fit all listings"
        className="flex h-7 w-7 items-center justify-center font-mono text-[9px] leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold"
      >
        FIT
      </button>
    </div>
  );
}

export default function DealBoardMap({
  listings,
  activeKey,
  onSelect,
  hrefFor,
  className = "",
  heightClass = "h-[420px]",
  showCallout = true,
}: {
  listings: readonly DealBoardMapListing[];
  /** Highlighted pin — kept in sync with the card list selection. */
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
  hrefFor?: (listing: DealBoardMapListing) => string;
  className?: string;
  heightClass?: string;
  /** Mobile shows a callout card for the tapped pin; desktop can defer to cards. */
  showCallout?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<LonLat>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(FALLBACK_ZOOM);
  /** Null until the first fit for a given filter result has been applied. */
  const fitSignatureRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenter: LonLat;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  const placeable = useMemo(() => listings.filter(hasCoords), [listings]);
  const missingCoords = listings.length - placeable.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const next = fitViewport(placeable, size.width, size.height);
    setCenter(next.center);
    setZoom(next.zoom);
  }, [placeable, size.height, size.width]);

  // Re-fit when the filtered set changes identity (not on every pan/zoom).
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const signature = `${placeable.length}:${placeable[0]?.key ?? ""}:${
      placeable[placeable.length - 1]?.key ?? ""
    }`;
    if (fitSignatureRef.current === signature) return;
    fitSignatureRef.current = signature;
    fit();
  }, [fit, placeable, size.height, size.width]);

  const viewport = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    const cx = lonToWorldX(center.lon, zoom);
    const cy = latToWorldY(center.lat, zoom);
    return {
      left: cx - size.width / 2,
      top: cy - size.height / 2,
    };
  }, [center.lat, center.lon, size.height, size.width, zoom]);

  const tiles = useMemo(() => {
    if (!viewport) return [];
    const n = 2 ** zoom;
    const firstCol = Math.floor(viewport.left / TILE_SIZE);
    const lastCol = Math.floor((viewport.left + size.width) / TILE_SIZE);
    const firstRow = Math.floor(viewport.top / TILE_SIZE);
    const lastRow = Math.floor((viewport.top + size.height) / TILE_SIZE);

    const out: { key: string; src: string; left: number; top: number }[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      if (row < 0 || row >= n) continue;
      for (let col = firstCol; col <= lastCol; col++) {
        const x = ((col % n) + n) % n;
        out.push({
          key: `${zoom}/${x}/${row}`,
          src: tileUrl(zoom, x, row),
          left: col * TILE_SIZE - viewport.left,
          top: row * TILE_SIZE - viewport.top,
        });
      }
    }
    return out;
  }, [size.height, size.width, viewport, zoom]);

  const pins = useMemo<PlacedPin[]>(() => {
    if (!viewport) return [];
    // Listings sharing a building would stack exactly — fan duplicates out so
    // every pin stays clickable.
    const seen = new Map<string, number>();
    const placed: PlacedPin[] = [];
    for (const listing of placeable) {
      const bucket = `${listing.latitude.toFixed(5)},${listing.longitude.toFixed(5)}`;
      const index = seen.get(bucket) ?? 0;
      seen.set(bucket, index + 1);
      const spread = index === 0 ? 0 : 9 * index;
      placed.push({
        listing,
        left: lonToWorldX(listing.longitude, zoom) - viewport.left + spread,
        top: latToWorldY(listing.latitude, zoom) - viewport.top - spread,
      });
    }
    // Selected pin renders last so its label is never covered.
    return placed.sort((a, b) => {
      if (a.listing.key === activeKey) return 1;
      if (b.listing.key === activeKey) return -1;
      return a.top - b.top;
    });
  }, [activeKey, placeable, viewport, zoom]);

  const panBy = useCallback(
    (dxPx: number, dyPx: number, from: LonLat) => {
      const cx = lonToWorldX(from.lon, zoom) - dxPx;
      const cy = latToWorldY(from.lat, zoom) - dyPx;
      setCenter(worldToLonLat(cx, cy, zoom));
    },
    [zoom],
  );

  const zoomAround = useCallback(
    (nextZoom: number, anchorX?: number, anchorY?: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      if (clamped === zoom) return;
      if (
        anchorX == null ||
        anchorY == null ||
        size.width <= 0 ||
        size.height <= 0
      ) {
        setZoom(clamped);
        return;
      }
      // Keep the point under the cursor fixed across the zoom change.
      const offsetX = anchorX - size.width / 2;
      const offsetY = anchorY - size.height / 2;
      const anchorLonLat = worldToLonLat(
        lonToWorldX(center.lon, zoom) + offsetX,
        latToWorldY(center.lat, zoom) + offsetY,
        zoom,
      );
      const nextCenterX = lonToWorldX(anchorLonLat.lon, clamped) - offsetX;
      const nextCenterY = latToWorldY(anchorLonLat.lat, clamped) - offsetY;
      setCenter(worldToLonLat(nextCenterX, nextCenterY, clamped));
      setZoom(clamped);
    },
    [center.lat, center.lon, size.height, size.width, zoom],
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current.size === 2) {
      const [a, b] = [...pinchRef.current.values()];
      pinchStartRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pinchRef.current.has(e.pointerId)) {
      pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pinchStart = pinchStartRef.current;
    if (pinchStart && pinchRef.current.size === 2) {
      const [a, b] = [...pinchRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && pinchStart.distance > 0) {
        const steps = Math.log2(distance / pinchStart.distance);
        zoomAround(Math.round(pinchStart.zoom + steps));
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    panBy(dx, dy, drag.startCenter);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pinchRef.current.delete(e.pointerId);
    if (pinchRef.current.size < 2) pinchStartRef.current = null;
    const drag = dragRef.current;
    if (drag?.pointerId === e.pointerId) dragRef.current = null;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Non-passive so the page does not scroll while zooming the map.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAround(
        zoom + (e.deltaY < 0 ? 1 : -1),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAround]);

  const active = useMemo(
    () => placeable.find((l) => l.key === activeKey) ?? null,
    [activeKey, placeable],
  );

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} touch-none select-none overflow-hidden rounded-lg border border-charcoal/[0.08] bg-[#e8e6df]`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="application"
        aria-label="Map of filtered listings"
      >
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            className="pointer-events-none absolute"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}

        {pins.map((pin) => {
          const isActive = pin.listing.key === activeKey;
          return (
            <button
              key={pin.listing.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(isActive ? null : pin.listing.key);
              }}
              className="absolute z-10 -translate-x-1/2 -translate-y-full"
              style={{ left: pin.left, top: pin.top }}
              aria-label={`${pin.listing.address} — ${pinPriceLabel(
                pin.listing.price,
                pin.listing.isRental,
              )}`}
              aria-pressed={isActive}
            >
              <span
                className={`block rounded-full border px-1.5 py-0.5 font-mono text-[10px] leading-none shadow-sm transition-colors ${
                  isActive
                    ? "border-coral bg-coral text-white"
                    : "border-navy/20 bg-white/95 text-navy hover:border-navy/50"
                }`}
              >
                {pinPriceLabel(pin.listing.price, pin.listing.isRental)}
              </span>
              <span
                className={`mx-auto block h-1.5 w-1.5 -translate-y-[3px] rotate-45 border-b border-r ${
                  isActive ? "border-coral bg-coral" : "border-navy/20 bg-white/95"
                }`}
                aria-hidden
              />
            </button>
          );
        })}

        <MapControls
          zoom={zoom}
          onZoomIn={() => zoomAround(zoom + 1)}
          onZoomOut={() => zoomAround(zoom - 1)}
          onFit={fit}
        />

        <div className="pointer-events-none absolute bottom-1.5 right-2 z-20 rounded bg-white/85 px-1.5 py-0.5 font-mono text-[8px] tracking-wide text-charcoal/55">
          {placeable.length} mapped
          {missingCoords > 0 ? ` · ${missingCoords} without coordinates` : ""}
        </div>

        {showCallout && active ? (
          <div className="absolute inset-x-2 bottom-2 z-30 rounded-lg border border-charcoal/10 bg-white/97 p-2.5 shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[19rem] sm:-translate-x-1/2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-serif text-sm text-navy">
                  {active.address}
                </p>
                <p className="mt-0.5 font-mono text-[10px] tracking-wide text-charcoal/55">
                  {[
                    active.city,
                    active.beds != null ? `${active.beds}bd` : null,
                    active.baths != null ? `${active.baths}ba` : null,
                    active.sqft ? `${active.sqft.toLocaleString()} sqft` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelect?.(null)}
                aria-label="Close"
                className="shrink-0 font-mono text-[10px] text-charcoal/40 hover:text-navy"
              >
                ✕
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-navy">
                {pinPriceLabel(active.price, active.isRental)}
                {active.isRental ? "/mo" : ""}
              </span>
              {hrefFor ? (
                <Link
                  href={hrefFor(active)}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold hover:text-navy"
                >
                  View listing →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
