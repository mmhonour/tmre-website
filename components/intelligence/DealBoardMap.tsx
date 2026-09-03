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
import { HouseIcon } from "@/components/icons";
import { loadZipBoundariesForZips } from "@/components/ZipBoundaryPopover";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import { DealBoardCardViewButton } from "@/components/intelligence/deal-board/DealBoardViewPicker";
import { useLocationEstimateOverlay } from "@/components/intelligence/use-location-estimate-overlay";
import { useLocationEstimateZipGrid } from "@/components/intelligence/use-location-estimate-zip-grid";
import { locationEstimateOverlayShapes } from "@/lib/location-estimate-map-shapes";

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
/**
 * Fit margins. A town boundary is framed so its AABB touches the visible map
 * (1px keeps the outline stroke on-canvas). A pin-only fit keeps room for the
 * price pills, which hang above and to the left of their anchor.
 */
const FIT_PAD_BOUNDARY = 1;
const FIT_PAD_PINS = 36;

type FitInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const ZERO_FIT_INSET: FitInset = { top: 0, right: 0, bottom: 0, left: 0 };

function normalizeFitInset(inset?: Partial<FitInset> | null): FitInset {
  return {
    top: Math.max(0, inset?.top ?? 0),
    right: Math.max(0, inset?.right ?? 0),
    bottom: Math.max(0, inset?.bottom ?? 0),
    left: Math.max(0, inset?.left ?? 0),
  };
}

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
type ZipRings = { zip: string; rings: Ring[] };
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

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return FALLBACK_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Geo coordinate under a point in the panel. */
function screenToLonLat(
  screenX: number,
  screenY: number,
  center: LonLat,
  zoom: number,
  size: { width: number; height: number },
): LonLat {
  const cx = lonToWorldX(center.lon, zoom) + (screenX - size.width / 2);
  const cy = latToWorldY(center.lat, zoom) + (screenY - size.height / 2);
  return worldToLonLat(cx, cy, zoom);
}

/** Centre that holds `anchor` under (screenX, screenY) at `zoom`. */
function centerForAnchor(
  anchor: LonLat,
  screenX: number,
  screenY: number,
  zoom: number,
  size: { width: number; height: number },
): LonLat {
  const cx = lonToWorldX(anchor.lon, zoom) - (screenX - size.width / 2);
  const cy = latToWorldY(anchor.lat, zoom) - (screenY - size.height / 2);
  return worldToLonLat(cx, cy, zoom);
}

/**
 * Zoom that fits `bounds` in a w×h panel. Fractional: the limiting axis lands
 * on the panel edge instead of dropping to the next whole tile level, which
 * used to waste up to half the panel. A tiny span (one pin, one block) gets a
 * street-level default rather than MAX_ZOOM.
 */
function fitBounds(
  bounds: GeoBounds | null,
  width: number,
  height: number,
  pinCount = 0,
  pad = FIT_PAD_PINS,
  inset?: Partial<FitInset> | null,
): { center: LonLat; zoom: number } {
  if (!bounds || width <= 0 || height <= 0) {
    return { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM };
  }

  const box = normalizeFitInset(inset);
  const availW = Math.max(32, width - pad * 2 - box.left - box.right);
  const availH = Math.max(32, height - pad * 2 - box.top - box.bottom);
  // Spans at zoom 0; world pixels scale by 2^zoom, so the fitting zoom is a
  // straight log2 rather than a search over whole levels.
  const spanX = lonToWorldX(bounds.maxLon, 0) - lonToWorldX(bounds.minLon, 0);
  const spanY = latToWorldY(bounds.minLat, 0) - latToWorldY(bounds.maxLat, 0);
  const zoomX = spanX > 0 ? Math.log2(availW / spanX) : MAX_ZOOM;
  const zoomY = spanY > 0 ? Math.log2(availH / spanY) : MAX_ZOOM;
  const zoom = clampZoom(Math.min(zoomX, zoomY));
  const fittedZoom = pinCount === 1 ? Math.min(zoom, 15) : zoom;
  const geoCenter = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lon: (bounds.minLon + bounds.maxLon) / 2,
  };
  // Place the town in the visible rectangle (above mobile chrome, etc.).
  const contentCx = box.left + pad + availW / 2;
  const contentCy = box.top + pad + availH / 2;
  const center = centerForAnchor(
    geoCenter,
    contentCx,
    contentCy,
    fittedZoom,
    { width, height },
  );
  return { center, zoom: fittedZoom };
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
  onReset,
  scopeLabel,
  viewAdjusted,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  /** What the default view frames — the selected town, zip, or all towns. */
  scopeLabel?: string;
  viewAdjusted: boolean;
}) {
  const resetTitle = scopeLabel
    ? `Reset view — ${scopeLabel} overview`
    : "Reset view";
  return (
    <div className="absolute left-2 top-2 z-20 flex flex-col items-start gap-1.5">
      <div className="flex flex-col overflow-hidden rounded-md border border-white/15 bg-navy/80 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= MAX_ZOOM - 0.001}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center font-mono text-sm leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
        <div className="h-px bg-white/10" aria-hidden />
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= MIN_ZOOM + 0.001}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center font-mono text-sm leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        aria-label={resetTitle}
        title={resetTitle}
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[9px] leading-none tracking-[0.1em] uppercase shadow-lg backdrop-blur-sm transition-colors ${
          viewAdjusted
            ? "border-gold/60 bg-navy/85 text-gold hover:bg-navy"
            : "border-white/15 bg-navy/80 text-white/70 hover:text-gold"
        }`}
      >
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          aria-hidden
          className="shrink-0"
        >
          <circle
            cx="6"
            cy="6"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M6 0.5v2M6 9.5v2M0.5 6h2M9.5 6h2"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        Reset view
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
  highlightZip = null,
  scopeLabel,
  activeKey,
  onSelect,
  hrefFor,
  className = "",
  heightClass = "h-[420px]",
  fullscreen = false,
  onFullscreenToggle,
  onExitToGrid,
  fitInset = ZERO_FIT_INSET,
  subjectKey = null,
}: {
  listings: readonly DealBoardMapListing[];
  /** TIGER ZCTA zips that frame the search (town, zip, or all towns). */
  boundZips?: readonly string[];
  /**
   * Zip whose outline reads blue instead of navy — the pill being hovered on
   * desktop, or the one just tapped. Drawn even when it sits outside the
   * framed search, and never allowed to move the viewport.
   */
  highlightZip?: string | null;
  /** Names the default view for the reset control ("Westport", "all towns"). */
  scopeLabel?: string;
  /** Highlighted pin — kept in sync with the card list selection. */
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
  hrefFor?: (listing: DealBoardMapListing) => string;
  className?: string;
  heightClass?: string;
  /** Phone full-screen mode: square corners and an exit control. */
  fullscreen?: boolean;
  onFullscreenToggle?: () => void;
  /** Phone: leave the map and show the board in grid view. */
  onExitToGrid?: () => void;
  /**
   * Visible-map inset (px). Mobile chrome sits on the canvas; fitting the
   * town to the leftover rectangle is what makes the outline touch the
   * usable edge in regular and full-screen mode.
   */
  fitInset?: Partial<FitInset>;
  /**
   * Marks one listing as the subject of the map — drawn as a house rather than
   * a price pill. Unset on the deal board, where every pin is a peer.
   */
  subjectKey?: string | null;
}) {
  const locationOverlay = useLocationEstimateOverlay();
  const locationGrid = useLocationEstimateZipGrid();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<LonLat>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(FALLBACK_ZOOM);
  /** Null until the first fit for a given filter result has been applied. */
  const fitSignatureRef = useRef<string | null>(null);
  /** Mouse drag pan. Touch pans and pinches through the native handlers below. */
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenter: LonLat;
    moved: boolean;
  } | null>(null);
  /** Live two-finger gesture: pinch scale and midpoint pan share one anchor. */
  const gestureRef = useRef<{
    distance: number;
    zoom: number;
    anchor: LonLat;
  } | null>(null);
  /** Single-finger pan. `tapEligible` is false for a finger left over from a pinch. */
  const panTouchRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    startCenter: LonLat;
    moved: boolean;
    tapEligible: boolean;
  } | null>(null);
  /** Once the visitor pans / zooms, only a new search area may re-fit. */
  const userMovedRef = useRef(false);
  /** Rendered twin of `userMovedRef`, so Reset view can advertise itself. */
  const [viewAdjusted, setViewAdjusted] = useState(false);
  /** Area the last auto-fit was for, so paging within it keeps the viewport. */
  const fitAreaRef = useRef<string | null>(null);
  /** Touch: first tap opens the preview card, the card itself opens the listing. */
  const [coarsePointer, setCoarsePointer] = useState(false);

  /** Rings stay grouped by zip so one zip can be restyled on its own. */
  const [zipRings, setZipRings] = useState<ZipRings[]>([]);
  /** Hovered zip outside the framed search — drawn, but not part of the fit. */
  const [extraRings, setExtraRings] = useState<ZipRings | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const placeable = useMemo(() => listings.filter(hasCoords), [listings]);
  const missingCoords = listings.length - placeable.length;
  const boundKey = boundZips.join(",");
  const highlight = highlightZip?.trim() || null;

  useEffect(() => {
    if (!boundKey) {
      setZipRings([]);
      return;
    }
    let cancelled = false;
    void loadZipBoundariesForZips(boundZips)
      .then((byZip) => {
        if (cancelled) return;
        const next: ZipRings[] = [];
        for (const zip of boundZips) {
          const found = byZip.get(zip);
          if (found) next.push({ zip, rings: found });
        }
        setZipRings(next);
      })
      .catch(() => {
        if (!cancelled) setZipRings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boundKey, boundZips]);

  useEffect(() => {
    if (!highlight || boundZips.includes(highlight)) {
      setExtraRings(null);
      return;
    }
    let cancelled = false;
    void loadZipBoundariesForZips([highlight])
      .then((byZip) => {
        if (cancelled) return;
        const found = byZip.get(highlight);
        setExtraRings(found ? { zip: highlight, rings: found } : null);
      })
      .catch(() => {
        if (!cancelled) setExtraRings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [highlight, boundKey, boundZips]);

  const rings = useMemo(
    () => zipRings.flatMap((entry) => entry.rings),
    [zipRings],
  );
  const searchBounds = useMemo(() => boundsFromRings(rings), [rings]);
  const pinBounds = useMemo(() => boundsFromPins(placeable), [placeable]);
  const fitTarget = searchBounds ?? pinBounds;

  // Gesture handlers run off refs so they never rebind mid-pinch.
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const searchBoundsRef = useRef(searchBounds);
  searchBoundsRef.current = searchBounds;
  const activeKeyRef = useRef(activeKey ?? null);
  activeKeyRef.current = activeKey ?? null;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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
    const next = fitBounds(
      fitTarget,
      size.width,
      size.height,
      placeable.length,
      searchBounds ? FIT_PAD_BOUNDARY : FIT_PAD_PINS,
      searchBounds ? fitInset : ZERO_FIT_INSET,
    );
    userMovedRef.current = false;
    setViewAdjusted(false);
    setCenter(next.center);
    setZoom(next.zoom);
  }, [fitInset, fitTarget, placeable.length, searchBounds, size.height, size.width]);

  /** Back to the default overview for the selected town(s), pin cleared. */
  const resetView = useCallback(() => {
    fit();
    onSelectRef.current?.(null);
  }, [fit]);

  const areaSignature = `${boundKey}:${rings.length}`;

  // Re-fit when the search area, the filtered set, or the panel size changes,
  // not on every pan. A hand-adjusted viewport survives paging (groups 1–20 →
  // 21–40), filters, and resizes; only a new search area, or Reset view,
  // overrides it. Panel size is in the signature so entering full screen
  // re-frames the town instead of keeping the small panel's zoom.
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const signature = `${areaSignature}:${placeable.length}:${
      placeable[0]?.key ?? ""
    }:${placeable[placeable.length - 1]?.key ?? ""}:${Math.round(
      size.width,
    )}x${Math.round(size.height)}:${Math.round(fitInset.top ?? 0)}/${Math.round(fitInset.bottom ?? 0)}`;
    if (fitSignatureRef.current === signature) return;
    const areaChanged = fitAreaRef.current !== areaSignature;
    fitSignatureRef.current = signature;
    fitAreaRef.current = areaSignature;
    if (userMovedRef.current && !areaChanged) return;
    fit();
  }, [areaSignature, fit, fitInset, placeable, size.height, size.width]);

  const viewport = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    const cx = lonToWorldX(center.lon, zoom);
    const cy = latToWorldY(center.lat, zoom);
    return {
      left: cx - size.width / 2,
      top: cy - size.height / 2,
    };
  }, [center.lat, center.lon, size.height, size.width, zoom]);

  /** Whole tile level behind the fractional zoom, plus its scale factor. */
  const tileZoom = clampZoom(Math.round(zoom));

  /**
   * Tiles for a whole zoom level, scaled into the current fractional viewport.
   * Keys stay stable while the scale changes, so a pinch resizes the images the
   * browser already has instead of refetching a whole level every frame.
   */
  const tilesFor = useCallback(
    (level: number) => {
      if (!viewport) return [];
      const n = 2 ** level;
      const tilePx = TILE_SIZE * 2 ** (zoom - level);
      if (!Number.isFinite(tilePx) || tilePx <= 0) return [];
      const firstCol = Math.floor(viewport.left / tilePx);
      const lastCol = Math.floor((viewport.left + size.width) / tilePx);
      const firstRow = Math.floor(viewport.top / tilePx);
      const lastRow = Math.floor((viewport.top + size.height) / tilePx);

      const out: {
        key: string;
        src: string;
        left: number;
        top: number;
        size: number;
      }[] = [];
      for (let row = firstRow; row <= lastRow; row++) {
        if (row < 0 || row >= n) continue;
        for (let col = firstCol; col <= lastCol; col++) {
          const x = ((col % n) + n) % n;
          out.push({
            key: `${level}/${x}/${row}`,
            src: tileUrl(level, x, row),
            left: col * tilePx - viewport.left,
            top: row * tilePx - viewport.top,
            // Half-pixel bleed: fractional tile sizes otherwise leave hairlines.
            size: tilePx + 0.5,
          });
        }
      }
      return out;
    },
    [size.height, size.width, viewport, zoom],
  );

  const tiles = useMemo(() => tilesFor(tileZoom), [tilesFor, tileZoom]);

  /**
   * The level we just left, held briefly underneath. Crossing a level swaps
   * every image at once, and without a backdrop that reads as a full-panel
   * flash while the new level decodes.
   */
  const [underlayZoom, setUnderlayZoom] = useState<number | null>(null);
  const lastTileZoomRef = useRef(tileZoom);
  useEffect(() => {
    if (lastTileZoomRef.current === tileZoom) return;
    setUnderlayZoom(lastTileZoomRef.current);
    lastTileZoomRef.current = tileZoom;
    const timer = setTimeout(() => setUnderlayZoom(null), 600);
    return () => clearTimeout(timer);
  }, [tileZoom]);

  const underlayTiles = useMemo(() => {
    if (underlayZoom == null || underlayZoom === tileZoom) return [];
    if (Math.abs(underlayZoom - zoom) > 2) return [];
    return tilesFor(underlayZoom);
  }, [tileZoom, tilesFor, underlayZoom, zoom]);

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
    // Subject, then selected, render last so their labels are never covered.
    const rank = (key: string) =>
      key === subjectKey ? 2 : key === activeKey || key === hoverKey ? 1 : 0;
    return placed.sort((a, b) => {
      const diff = rank(a.listing.key) - rank(b.listing.key);
      return diff !== 0 ? diff : a.top - b.top;
    });
  }, [activeKey, hoverKey, placeable, subjectKey, viewport, zoom]);

  const panBy = useCallback((dxPx: number, dyPx: number, from: LonLat) => {
    const level = zoomRef.current;
    const cx = lonToWorldX(from.lon, level) - dxPx;
    const cy = latToWorldY(from.lat, level) - dyPx;
    userMovedRef.current = true;
    setViewAdjusted(true);
    setCenter(clampCenter(worldToLonLat(cx, cy, level), searchBoundsRef.current));
  }, []);

  /** Move to `nextZoom` keeping `anchor` pinned under (screenX, screenY). */
  const applyAnchoredView = useCallback(
    (anchor: LonLat, screenX: number, screenY: number, nextZoom: number) => {
      const panel = sizeRef.current;
      if (panel.width <= 0 || panel.height <= 0) return;
      const clamped = clampZoom(nextZoom);
      userMovedRef.current = true;
      setViewAdjusted(true);
      setCenter(
        clampCenter(
          centerForAnchor(anchor, screenX, screenY, clamped, panel),
          searchBoundsRef.current,
        ),
      );
      setZoom(clamped);
    },
    [],
  );

  const zoomAround = useCallback(
    (nextZoom: number, anchorX?: number, anchorY?: number) => {
      const panel = sizeRef.current;
      const current = zoomRef.current;
      const clamped = clampZoom(nextZoom);
      if (Math.abs(clamped - current) < 0.001) return;
      if (
        anchorX == null ||
        anchorY == null ||
        panel.width <= 0 ||
        panel.height <= 0
      ) {
        userMovedRef.current = true;
        setViewAdjusted(true);
        setZoom(clamped);
        return;
      }
      // Keep the point under the cursor / pinch midpoint fixed.
      const anchor = screenToLonLat(
        anchorX,
        anchorY,
        centerRef.current,
        current,
        panel,
      );
      applyAnchoredView(anchor, anchorX, anchorY, clamped);
    },
    [applyAnchoredView],
  );

  const releaseDragCapture = (target: HTMLDivElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      /* Safari can throw if the pointer already ended. */
    }
  };

  // Mouse and pen only. Touch runs through the native listeners below, which
  // own panning and pinching together — two systems both moving the viewport is
  // what made pinches jump and the panel strobe.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
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
    if (e.pointerType === "touch") return;
    const drag = dragRef.current;
    if (drag?.pointerId === e.pointerId) {
      releaseDragCapture(e.currentTarget, e.pointerId);
      dragRef.current = null;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Non-passive so the page does not scroll while zooming the map. Trackpad
    // pinch arrives as ctrl+wheel and gets the finer, continuous step.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const step = e.ctrlKey
        ? Math.max(-1.5, Math.min(1.5, -e.deltaY * 0.01))
        : e.deltaY < 0
          ? 0.5
          : -0.5;
      zoomAround(
        zoomRef.current + step,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  /**
   * Touch gestures, native because iOS Safari often never sends a second
   * pointerdown. One finger pans; two fingers pinch *and* pan, since both fall
   * out of holding the coordinate under the starting midpoint beneath the live
   * midpoint. Two fingers moving in parallel therefore drag the map with no
   * zoom change, which is how every other map behaves.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const panelPoint = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const captureGesture = (touches: TouchList) => {
      if (touches.length < 2) return;
      const a = touches[0];
      const b = touches[1];
      const mid = panelPoint(
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2,
      );
      gestureRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: zoomRef.current,
        anchor: screenToLonLat(
          mid.x,
          mid.y,
          centerRef.current,
          zoomRef.current,
          sizeRef.current,
        ),
      };
    };

    const capturePan = (touch: Touch, tapEligible: boolean) => {
      panTouchRef.current = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startCenter: centerRef.current,
        moved: false,
        tapEligible,
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        panTouchRef.current = null;
        dragRef.current = null;
        captureGesture(e.touches);
        return;
      }
      // No preventDefault: a stationary finger must still produce the click a
      // pin needs to open its preview card.
      capturePan(e.touches[0], true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const gesture = gestureRef.current;
        if (!gesture) {
          captureGesture(e.touches);
          return;
        }
        const a = e.touches[0];
        const b = e.touches[1];
        const distance = Math.hypot(
          a.clientX - b.clientX,
          a.clientY - b.clientY,
        );
        const mid = panelPoint(
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2,
        );
        const ratio =
          gesture.distance > 0 && distance > 0
            ? distance / gesture.distance
            : 1;
        applyAnchoredView(
          gesture.anchor,
          mid.x,
          mid.y,
          gesture.zoom + Math.log2(ratio),
        );
        return;
      }

      const pan = panTouchRef.current;
      if (!pan) return;
      let touch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === pan.id) touch = e.touches[i];
      }
      if (!touch) return;
      const dx = touch.clientX - pan.startX;
      const dy = touch.clientY - pan.startY;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      pan.moved = true;
      e.preventDefault();
      panBy(dx, dy, pan.startCenter);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        captureGesture(e.touches);
        return;
      }
      if (e.touches.length === 1) {
        // Lifting one finger hands the map to the one still down instead of
        // freezing until both are up.
        gestureRef.current = null;
        capturePan(e.touches[0], false);
        return;
      }
      const pan = panTouchRef.current;
      const tapped =
        pan != null && pan.tapEligible && !pan.moved && gestureRef.current == null;
      gestureRef.current = null;
      panTouchRef.current = null;
      // A tap on open map closes the preview card. Taps that land on a pin or
      // on the card itself keep it (the card is the link to the listing).
      if (!tapped || activeKeyRef.current == null) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("[data-map-preview-anchor]")
      ) {
        return;
      }
      onSelectRef.current?.(null);
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
  }, [applyAnchoredView, panBy]);

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

  const boundaryLayers = useMemo(() => {
    if (!viewport) return [];
    const source = extraRings ? [...zipRings, extraRings] : zipRings;
    return source
      .map((entry) => ({
        zip: entry.zip,
        paths: entry.rings
          .map((ring) => ringToPath(ring, viewport, zoom))
          .filter(Boolean),
      }))
      .filter((layer) => layer.paths.length > 0);
  }, [zipRings, extraRings, viewport, zoom]);

  /** Even-odd mask dims everything outside the framed search only. */
  const maskPaths = useMemo(() => {
    if (!viewport || rings.length === 0) return [];
    return rings
      .map((ring) => ringToPath(ring, viewport, zoom))
      .filter(Boolean);
  }, [rings, viewport, zoom]);

  const estimateOverlay = useMemo(
    () => locationEstimateOverlayShapes(locationGrid.cells),
    [locationGrid.cells],
  );

  const estimateOverlayPaths = useMemo(() => {
    if (!locationOverlay.enabled || !viewport) return [];
    return estimateOverlay.rings
      .map((layer) => ({
        ...layer,
        d: ringToPath(layer.ring, viewport, zoom),
      }))
      .filter((layer) => layer.d);
  }, [estimateOverlay.rings, locationOverlay.enabled, viewport, zoom]);

  const estimateOverlayDots = useMemo(() => {
    if (!locationOverlay.enabled || !viewport) return [];
    return estimateOverlay.dots.map((dot) => ({
      ...dot,
      left: lonToWorldX(dot.lon, zoom) - viewport.left,
      top: latToWorldY(dot.lat, zoom) - viewport.top,
    }));
  }, [estimateOverlay.dots, locationOverlay.enabled, viewport, zoom]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} touch-none select-none overflow-hidden bg-[#e8e6df] ${
          fullscreen ? "" : "rounded-lg border border-charcoal/[0.08]"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="application"
        aria-label="Map of filtered listings"
      >
        {underlayTiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`under-${tile.key}`}
            src={tile.src}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            className="pointer-events-none absolute"
            style={{
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size,
            }}
          />
        ))}

        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            decoding="async"
            className="pointer-events-none absolute"
            style={{
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size,
            }}
          />
        ))}

        {boundaryLayers.length > 0 && size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
            viewBox={`0 0 ${size.width} ${size.height}`}
            aria-hidden
          >
            {maskPaths.length > 0 ? (
              <path
                d={`M0 0H${size.width}V${size.height}H0Z ${maskPaths.join(" ")}`}
                fill="rgba(26, 39, 68, 0.28)"
                fillRule="evenodd"
              />
            ) : null}
            {boundaryLayers.map((layer) => {
              const lit = layer.zip === highlight;
              return layer.paths.map((d, i) => (
                <path
                  key={`${layer.zip}-${i}`}
                  d={d}
                  fill={lit ? "rgba(74, 141, 183, 0.22)" : "none"}
                  stroke={
                    lit ? "rgba(74, 141, 183, 0.95)" : "rgba(26, 39, 68, 0.85)"
                  }
                  strokeWidth={lit ? 2.4 : 1.6}
                  className="transition-[stroke,fill,stroke-width] duration-150 ease-out"
                />
              ));
            })}
          </svg>
        ) : null}

        {estimateOverlayPaths.length > 0 && size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
            viewBox={`0 0 ${size.width} ${size.height}`}
            aria-hidden
          >
            {estimateOverlayPaths.map((layer) => (
              <path
                key={layer.id}
                d={layer.d}
                fill={
                  layer.kind === "town_center"
                    ? "rgba(74, 141, 183, 0.16)"
                    : "rgba(232, 93, 58, 0.08)"
                }
                stroke={
                  layer.kind === "town_center"
                    ? "rgba(74, 141, 183, 1)"
                    : "rgba(232, 93, 58, 0.95)"
                }
                strokeWidth={layer.kind === "town_center" ? 2.4 : 2}
                strokeDasharray={layer.kind === "town_center" ? "7 5" : "4 3.5"}
                opacity={
                  layer.kind === "coastal_strip"
                    ? Math.max(0.55, 1 - (layer.stripIndex ?? 0) * 0.12)
                    : 1
                }
              />
            ))}
          </svg>
        ) : null}

        {estimateOverlayDots.map((dot) => (
          <span
            key={dot.id}
            className="pointer-events-none absolute z-[7] flex -translate-x-1/2 -translate-y-full flex-col items-center"
            style={{ left: dot.left, top: dot.top }}
          >
            <span className="mb-0.5 whitespace-nowrap rounded-sm bg-navy/80 px-1 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-white">
              {dot.label}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-sky shadow-[0_0_0_1px_rgba(255,255,255,0.75)]" />
          </span>
        ))}

        {pins.map((pin) => {
          const isActive =
            pin.listing.key === activeKey || pin.listing.key === hoverKey;
          const href = hrefFor?.(pin.listing);
          const label = `${pin.listing.address} — ${pinPriceLabel(
            pin.listing.price,
            pin.listing.isRental,
          )}`;
          const isSubject = subjectKey != null && pin.listing.key === subjectKey;
          const pinClass = `absolute -translate-x-1/2 -translate-y-full origin-bottom transition-transform ${
            isSubject ? "z-30" : isActive ? "z-20 scale-125" : "z-10"
          }`;
          const pinStyle = { left: pin.left, top: pin.top };
          const pill = isSubject ? (
            <span className="flex flex-col items-center">
              <span className="text-sky drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                <HouseIcon className="h-6 w-6" />
              </span>
              <span className="mt-0.5 whitespace-nowrap rounded-full border border-sky/50 bg-white/95 px-1.5 py-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-navy shadow-sm">
                This home
              </span>
            </span>
          ) : (
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

        {locationOverlay.unlocked ? (
          <button
            type="button"
            onClick={() => void locationOverlay.setEnabled(!locationOverlay.enabled)}
            disabled={locationOverlay.busy}
            aria-pressed={locationOverlay.enabled}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") e.stopPropagation();
            }}
            className={`absolute left-12 top-2 z-30 rounded-md border px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] shadow-lg backdrop-blur-sm transition-colors ${
              locationOverlay.enabled
                ? "border-sky/40 bg-navy/90 text-sky"
                : "border-white/15 bg-navy/85 text-white/80 hover:text-gold"
            }`}
          >
            {locationOverlay.enabled ? "Hide corridors" : "Show corridors"}
          </button>
        ) : null}

        <MapControls
          zoom={zoom}
          // Snap to whole levels from a fractional zoom rather than adding 1 to
          // a fraction, so the buttons always land somewhere predictable.
          onZoomIn={() => zoomAround(Math.floor(zoom + 1))}
          onZoomOut={() => zoomAround(Math.ceil(zoom - 1))}
          onReset={resetView}
          scopeLabel={scopeLabel}
          viewAdjusted={viewAdjusted}
        />

        {onFullscreenToggle || onExitToGrid ? (
          <div className="absolute right-2 top-2 z-30 flex flex-col items-stretch gap-1 md:hidden">
            {onFullscreenToggle ? (
              <button
                type="button"
                onClick={onFullscreenToggle}
                aria-pressed={fullscreen}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-navy/85 px-1.5 py-1 font-mono text-[9px] leading-none tracking-[0.1em] uppercase text-white/85 shadow-lg backdrop-blur-sm transition-colors hover:text-gold"
              >
                {fullscreen ? (
                  <>
                    <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
                      <path
                        d="M2 2l8 8M10 2l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                    Exit
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
                      <path
                        d="M1 4V1h3M11 4V1H8M1 8v3h3M11 8v3H8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Full screen
                  </>
                )}
              </button>
            ) : null}
            {onExitToGrid ? (
              <DealBoardCardViewButton
                view="grid"
                onClick={onExitToGrid}
                tone="onDark"
                className="h-7 w-7 self-end"
                label="Show grid view"
              />
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-1.5 right-2 z-20 hidden rounded bg-white/85 px-1.5 py-0.5 font-mono text-[8px] tracking-wide text-charcoal/55 md:block">
          {placeable.length} mapped
          {missingCoords > 0 ? ` · ${missingCoords} without coordinates` : ""}
        </div>

      </div>
    </div>
  );
}
