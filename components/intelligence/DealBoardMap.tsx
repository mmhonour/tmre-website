"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { loadZipBoundariesForZips } from "@/components/ZipBoundaryPopover";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

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
  photoCount?: number | null;
  primaryPhotoIndex?: number | null;
};

type LonLat = { lat: number; lon: number };
type Ring = [number, number][];
type GeoBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

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

function boundsFromRings(rings: readonly Ring[]): GeoBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let any = false;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      any = true;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return any ? { minLat, maxLat, minLon, maxLon } : null;
}

function boundsFromPins(
  pins: readonly (DealBoardMapListing & { latitude: number; longitude: number })[],
): GeoBounds | null {
  if (pins.length === 0) return null;
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
  return { minLat, maxLat, minLon, maxLon };
}

function clampCenter(center: LonLat, bounds: GeoBounds | null): LonLat {
  if (!bounds) return center;
  return {
    lat: Math.min(bounds.maxLat, Math.max(bounds.minLat, center.lat)),
    lon: Math.min(bounds.maxLon, Math.max(bounds.minLon, center.lon)),
  };
}

/**
 * Zoom that fits `bounds` in a w×h panel. A tiny span (one pin, one block)
 * gets a street-level default rather than MAX_ZOOM.
 */
function fitBounds(
  bounds: GeoBounds | null,
  width: number,
  height: number,
  pinCount = 0,
): { center: LonLat; zoom: number } {
  if (!bounds || width <= 0 || height <= 0) {
    return { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM };
  }

  const center = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lon: (bounds.minLon + bounds.maxLon) / 2,
  };

  const padded = { w: Math.max(64, width - 72), h: Math.max(64, height - 72) };
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom--) {
    const spanX =
      lonToWorldX(bounds.maxLon, zoom) - lonToWorldX(bounds.minLon, zoom);
    const spanY =
      latToWorldY(bounds.minLat, zoom) - latToWorldY(bounds.maxLat, zoom);
    if (spanX <= padded.w && spanY <= padded.h) {
      return { center, zoom: pinCount === 1 ? Math.min(zoom, 15) : zoom };
    }
  }
  return { center, zoom: MIN_ZOOM };
}

function ringToPath(
  ring: Ring,
  viewport: { left: number; top: number },
  zoom: number,
): string {
  if (ring.length < 3) return "";
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const x = lonToWorldX(lon, zoom) - viewport.left;
    const y = latToWorldY(lat, zoom) - viewport.top;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
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
        aria-label="Fit search area"
        title="Fit search area"
        className="flex h-7 w-7 items-center justify-center font-mono text-[9px] leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold"
      >
        FIT
      </button>
    </div>
  );
}

/**
 * Pin preview. Hover-only on mouse (never eats clicks); on touch it is the tap
 * target that opens the listing, since the first pin tap only opens this card.
 */
function PreviewCard({
  href,
  left,
  top,
  children,
}: {
  href?: string;
  left: number;
  top: number;
  children: ReactNode;
}) {
  const className = `absolute z-30 w-[11.5rem] -translate-x-1/2 -translate-y-[calc(100%+10px)] overflow-hidden rounded-md border border-charcoal/10 bg-white shadow-lg ${
    href ? "" : "pointer-events-none"
  }`;
  const style = { left, top };
  if (!href) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <Link href={href} className={className} style={style} data-map-preview-anchor="">
      {children}
    </Link>
  );
}

export default function DealBoardMap({
  listings,
  boundZips = [],
  activeKey,
  onSelect,
  hrefFor,
  className = "",
  heightClass = "h-[420px]",
}: {
  listings: readonly DealBoardMapListing[];
  /** TIGER ZCTA zips that frame the search (town, zip, or all towns). */
  boundZips?: readonly string[];
  /** Highlighted pin — kept in sync with the card list selection. */
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
  hrefFor?: (listing: DealBoardMapListing) => string;
  className?: string;
  heightClass?: string;
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
  /** Once the visitor pans / zooms, only a new search area may re-fit. */
  const userMovedRef = useRef(false);
  /** Area the last auto-fit was for, so paging within it keeps the viewport. */
  const fitAreaRef = useRef<string | null>(null);
  /** Touch: first tap opens the preview card, the card itself opens the listing. */
  const [coarsePointer, setCoarsePointer] = useState(false);

  const [rings, setRings] = useState<Ring[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const placeable = useMemo(() => listings.filter(hasCoords), [listings]);
  const missingCoords = listings.length - placeable.length;
  const boundKey = boundZips.join(",");

  useEffect(() => {
    if (!boundKey) {
      setRings([]);
      return;
    }
    let cancelled = false;
    void loadZipBoundariesForZips(boundZips)
      .then((byZip) => {
        if (cancelled) return;
        const next: Ring[] = [];
        for (const zip of boundZips) {
          const found = byZip.get(zip);
          if (found) next.push(...found);
        }
        setRings(next);
      })
      .catch(() => {
        if (!cancelled) setRings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boundKey, boundZips]);

  const searchBounds = useMemo(() => boundsFromRings(rings), [rings]);
  const pinBounds = useMemo(() => boundsFromPins(placeable), [placeable]);
  const fitTarget = searchBounds ?? pinBounds;

  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
    const next = fitBounds(fitTarget, size.width, size.height, placeable.length);
    userMovedRef.current = false;
    setCenter(next.center);
    setZoom(next.zoom);
  }, [fitTarget, placeable.length, size.height, size.width]);

  const areaSignature = `${boundKey}:${rings.length}`;

  // Re-fit when the search area or filtered set changes, not on every pan. A
  // hand-adjusted viewport survives paging (groups 1–20 → 21–40) and filters;
  // only a new search area, or the FIT control, overrides it.
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const signature = `${areaSignature}:${placeable.length}:${
      placeable[0]?.key ?? ""
    }:${placeable[placeable.length - 1]?.key ?? ""}`;
    if (fitSignatureRef.current === signature) return;
    const areaChanged = fitAreaRef.current !== areaSignature;
    fitSignatureRef.current = signature;
    fitAreaRef.current = areaSignature;
    if (userMovedRef.current && !areaChanged) return;
    fit();
  }, [areaSignature, fit, placeable, size.height, size.width]);

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
      if (a.listing.key === activeKey || a.listing.key === hoverKey) return 1;
      if (b.listing.key === activeKey || b.listing.key === hoverKey) return -1;
      return a.top - b.top;
    });
  }, [activeKey, hoverKey, placeable, viewport, zoom]);

  const panBy = useCallback(
    (dxPx: number, dyPx: number, from: LonLat) => {
      const cx = lonToWorldX(from.lon, zoom) - dxPx;
      const cy = latToWorldY(from.lat, zoom) - dyPx;
      userMovedRef.current = true;
      setCenter(clampCenter(worldToLonLat(cx, cy, zoom), searchBounds));
    },
    [searchBounds, zoom],
  );

  const zoomAround = useCallback(
    (nextZoom: number, anchorX?: number, anchorY?: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(nextZoom)));
      if (clamped === zoom) return;
      userMovedRef.current = true;
      if (
        anchorX == null ||
        anchorY == null ||
        size.width <= 0 ||
        size.height <= 0
      ) {
        setZoom(clamped);
        return;
      }
      // Keep the point under the cursor / pinch midpoint fixed.
      const offsetX = anchorX - size.width / 2;
      const offsetY = anchorY - size.height / 2;
      const anchorLonLat = worldToLonLat(
        lonToWorldX(center.lon, zoom) + offsetX,
        latToWorldY(center.lat, zoom) + offsetY,
        zoom,
      );
      const nextCenterX = lonToWorldX(anchorLonLat.lon, clamped) - offsetX;
      const nextCenterY = latToWorldY(anchorLonLat.lat, clamped) - offsetY;
      setCenter(
        clampCenter(worldToLonLat(nextCenterX, nextCenterY, clamped), searchBounds),
      );
      setZoom(clamped);
    },
    [center.lat, center.lon, searchBounds, size.height, size.width, zoom],
  );

  const zoomRef = useRef(zoom);
  const zoomAroundRef = useRef(zoomAround);
  zoomRef.current = zoom;
  zoomAroundRef.current = zoomAround;

  const releaseDragCapture = (target: HTMLDivElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      /* Safari can throw if the pointer already ended. */
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current.size >= 2) {
      const [a, b] = [...pinchRef.current.values()];
      pinchStartRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      };
      const drag = dragRef.current;
      if (drag) {
        releaseDragCapture(e.currentTarget, drag.pointerId);
        dragRef.current = null;
      }
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      moved: false,
    };
    // Capture only after we know this is a one-finger pan — a second finger
    // must still be able to land for pinch-zoom on iOS.
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pinchRef.current.has(e.pointerId)) {
      pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pinchStart = pinchStartRef.current;
    if (pinchStart && pinchRef.current.size >= 2) {
      const [a, b] = [...pinchRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && pinchStart.distance > 0) {
        const steps = Math.log2(distance / pinchStart.distance);
        zoomAround(pinchStart.zoom + steps);
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    panBy(dx, dy, drag.startCenter);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pinchRef.current.delete(e.pointerId);
    if (pinchRef.current.size < 2) pinchStartRef.current = null;
    const drag = dragRef.current;
    const tapped = drag?.pointerId === e.pointerId && !drag.moved;
    if (drag?.pointerId === e.pointerId) {
      releaseDragCapture(e.currentTarget, e.pointerId);
      dragRef.current = null;
    }
    // Touch: a tap on open map closes the preview card. Taps that land on a
    // pin or on the card itself keep it (the card is the link to the listing).
    if (!tapped || e.pointerType === "mouse" || activeKey == null) return;
    const target = e.target;
    if (target instanceof Element && target.closest("[data-map-preview-anchor]")) {
      return;
    }
    onSelect?.(null);
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

  // iOS Safari often never sends a second pointerdown. Native touches still
  // fire, including when a finger starts on a pin, so pinch lives here.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applyPinch = (touches: TouchList) => {
      if (touches.length < 2) return;
      const a = touches[0];
      const b = touches[1];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      let start = pinchStartRef.current;
      if (!start || start.distance <= 0) {
        start = { distance, zoom: zoomRef.current };
        pinchStartRef.current = start;
      }
      if (distance <= 0 || start.distance <= 0) return;
      const rect = el.getBoundingClientRect();
      const midX = (a.clientX + b.clientX) / 2 - rect.left;
      const midY = (a.clientY + b.clientY) / 2 - rect.top;
      zoomAroundRef.current(
        start.zoom + Math.log2(distance / start.distance),
        midX,
        midY,
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      e.preventDefault();
      dragRef.current = null;
      const a = e.touches[0];
      const b = e.touches[1];
      pinchStartRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: zoomRef.current,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      e.preventDefault();
      applyPinch(e.touches);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const previewKey = hoverKey ?? activeKey ?? null;
  const hovered = useMemo(
    () => placeable.find((l) => l.key === previewKey) ?? null,
    [placeable, previewKey],
  );
  const hoveredPin = useMemo(
    () => pins.find((p) => p.listing.key === previewKey) ?? null,
    [pins, previewKey],
  );

  const lastCenteredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeKey || size.width <= 0 || size.height <= 0) {
      if (!activeKey) lastCenteredKeyRef.current = null;
      return;
    }
    if (lastCenteredKeyRef.current === activeKey) return;
    const listing = placeable.find((l) => l.key === activeKey);
    if (!listing) return;
    const cx = lonToWorldX(center.lon, zoom);
    const cy = latToWorldY(center.lat, zoom);
    const left = lonToWorldX(listing.longitude, zoom) - (cx - size.width / 2);
    const top = latToWorldY(listing.latitude, zoom) - (cy - size.height / 2);
    const pad = 64;
    const onScreen =
      left >= pad &&
      left <= size.width - pad &&
      top >= pad &&
      top <= size.height - pad;
    lastCenteredKeyRef.current = activeKey;
    if (onScreen) return;
    setCenter(
      clampCenter(
        { lat: listing.latitude, lon: listing.longitude },
        searchBounds,
      ),
    );
  }, [
    activeKey,
    center.lat,
    center.lon,
    placeable,
    searchBounds,
    size.height,
    size.width,
    zoom,
  ]);

  const boundaryPaths = useMemo(() => {
    if (!viewport || rings.length === 0) return [];
    return rings
      .map((ring) => ringToPath(ring, viewport, zoom))
      .filter(Boolean);
  }, [rings, viewport, zoom]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} touch-none select-none overflow-hidden rounded-lg border border-charcoal/[0.08] bg-[#e8e6df]`}
        style={{ touchAction: "none" }}
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

        {boundaryPaths.length > 0 && size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
            viewBox={`0 0 ${size.width} ${size.height}`}
            aria-hidden
          >
            <path
              d={`M0 0H${size.width}V${size.height}H0Z ${boundaryPaths.join(" ")}`}
              fill="rgba(26, 39, 68, 0.28)"
              fillRule="evenodd"
            />
            {boundaryPaths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(26, 39, 68, 0.85)"
                strokeWidth="1.6"
              />
            ))}
          </svg>
        ) : null}

        {pins.map((pin) => {
          const isActive =
            pin.listing.key === activeKey || pin.listing.key === hoverKey;
          const href = hrefFor?.(pin.listing);
          const label = `${pin.listing.address} — ${pinPriceLabel(
            pin.listing.price,
            pin.listing.isRental,
          )}`;
          const pinClass = `absolute z-10 -translate-x-1/2 -translate-y-full origin-bottom transition-transform ${
            isActive ? "z-20 scale-125" : ""
          }`;
          const pinStyle = { left: pin.left, top: pin.top };
          const pill = (
            <>
              <span
                className={`block rounded-full border px-1.5 py-0.5 font-mono leading-none shadow-sm transition-colors ${
                  isActive
                    ? "border-coral bg-coral text-[12px] text-white"
                    : "border-navy/20 bg-white/95 text-[10px] text-navy hover:border-navy/50"
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
            </>
          );
          const hoverHandlers = {
            "data-map-preview-anchor": "",
            onMouseEnter: () => {
              setHoverKey(pin.listing.key);
              onSelect?.(pin.listing.key);
            },
            onMouseLeave: () => {
              setHoverKey(null);
              onSelect?.(null);
            },
            onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
              // Mouse: don't start a map pan when clicking a pin. Touch must
              // bubble so a second finger can pinch-zoom.
              if (e.pointerType === "mouse") e.stopPropagation();
            },
          };
          if (href && !coarsePointer) {
            return (
              <Link
                key={pin.listing.key}
                href={href}
                className={pinClass}
                style={pinStyle}
                aria-label={label}
                {...hoverHandlers}
              >
                {pill}
              </Link>
            );
          }
          return (
            <button
              key={pin.listing.key}
              type="button"
              className={pinClass}
              style={pinStyle}
              aria-label={label}
              {...hoverHandlers}
              onClick={() =>
                onSelect?.(
                  activeKey === pin.listing.key ? null : pin.listing.key,
                )
              }
            >
              {pill}
            </button>
          );
        })}

        {hovered && hoveredPin ? (
          <PreviewCard
            href={coarsePointer ? hrefFor?.(hovered) : undefined}
            left={hoveredPin.left}
            top={hoveredPin.top}
          >
            {hovered.photoCount != null && hovered.photoCount > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listingPhotoProxyUrl(
                  hovered.key,
                  hovered.primaryPhotoIndex != null &&
                    hovered.primaryPhotoIndex >= 0
                    ? hovered.primaryPhotoIndex
                    : 0,
                )}
                alt=""
                className="h-20 w-full object-cover"
              />
            ) : (
              <div className="flex h-14 items-center justify-center bg-charcoal/[0.05] font-mono text-[9px] tracking-wide text-charcoal/40">
                No photo
              </div>
            )}
            <div className="px-2 py-1.5">
              <p className="truncate font-serif text-[13px] leading-snug text-navy">
                {hovered.address}
              </p>
              <p className="mt-0.5 truncate font-mono text-[9px] tracking-wide text-charcoal/55">
                {[
                  hovered.city,
                  hovered.beds != null ? `${hovered.beds}bd` : null,
                  hovered.baths != null ? `${hovered.baths}ba` : null,
                  pinPriceLabel(hovered.price, hovered.isRental) +
                    (hovered.isRental ? "/mo" : ""),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {coarsePointer ? (
                <p className="mt-1 font-mono text-[8px] tracking-[0.14em] uppercase text-gold">
                  Tap for the listing
                </p>
              ) : null}
            </div>
          </PreviewCard>
        ) : null}

        <MapControls
          zoom={zoom}
          onZoomIn={() => zoomAround(zoom + 1)}
          onZoomOut={() => zoomAround(zoom - 1)}
          onFit={fit}
        />

        <div className="pointer-events-none absolute bottom-1.5 right-2 z-20 hidden rounded bg-white/85 px-1.5 py-0.5 font-mono text-[8px] tracking-wide text-charcoal/55 md:block">
          {placeable.length} mapped
          {missingCoords > 0 ? ` · ${missingCoords} without coordinates` : ""}
        </div>

      </div>
    </div>
  );
}
