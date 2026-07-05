"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  neighborTownsFor,
  type TmreTown,
  zipsForNeighborTowns,
  zipsForTown,
} from "@/lib/tmre-towns";

type Coord = [number, number];
type Ring = Coord[];

type BoundaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; byZip: Map<string, Ring[]> }
  | { status: "error" };

const cache = new Map<string, Ring[]>();
/** Cached assembled boundary bundles per popover load key (avoids loading flashes). */
const boundaryBundleCache = new Map<string, Map<string, Ring[]>>();

const TIGER_LAYER = 1; // 2020 Census ZIP Code Tabulation Areas

async function fetchBoundary(zip: string): Promise<Ring[]> {
  if (cache.has(zip)) return cache.get(zip)!;

  const url =
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/` +
    `PUMA_TAD_TAZ_UGA_ZCTA/MapServer/${TIGER_LAYER}/query` +
    `?where=ZCTA5%3D'${encodeURIComponent(zip)}'` +
    `&outFields=ZCTA5&returnGeometry=true&f=geojson&outSR=4326`;

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    error?: { message?: string };
    features?: { geometry: { type: string; coordinates: unknown } }[];
  };
  if (data.error) throw new Error(data.error.message ?? "Boundary query failed");

  const rings: Ring[] = [];
  for (const feature of data.features ?? []) {
    const { type, coordinates } = feature.geometry;
    if (type === "Polygon") {
      rings.push((coordinates as Ring[])[0]);
    } else if (type === "MultiPolygon") {
      for (const poly of coordinates as Ring[][]) {
        rings.push(poly[0]);
      }
    }
  }
  if (rings.length === 0) throw new Error("No boundary geometry");
  cache.set(zip, rings);
  return rings;
}

/** Warm the module cache for town zip pills (fire-and-forget). */
export function prefetchZipBoundaries(zips: readonly string[]): void {
  for (const zip of zips) {
    if (!cache.has(zip)) {
      fetchBoundary(zip).catch(() => {});
    }
  }
}

/** Prefetch a town plus bordering town zips before the popover opens. */
export function prefetchTownBoundaries(town: TmreTown): void {
  prefetchZipBoundaries([...zipsForTown(town), ...zipsForNeighborTowns(town)]);
}

function ringBBoxCenter(rings: Ring[]): Coord | null {
  if (rings.length === 0) return null;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

function projectMultipleZips(
  zipBoundaries: { zip: string; rings: Ring[] }[],
  highlightZips: Set<string>,
  w: number,
  h: number,
  pad = 12,
): {
  layers: { zip: string; paths: string[]; role: "highlight" | "context" }[];
  highlightCx: number;
  highlightCy: number;
  projection: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  } | null;
} {
  const allRings = zipBoundaries.flatMap((z) => z.rings);
  if (allRings.length === 0) {
    return {
      layers: [],
      highlightCx: w / 2,
      highlightCy: h / 2,
      projection: null,
    };
  }

  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const ring of allRings) {
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

  function toSvg([lon, lat]: Coord): string {
    const x = offsetX + (lon - minLon) * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }

  const layers = zipBoundaries.map(({ zip, rings }) => ({
    zip,
    role: highlightZips.has(zip) ? ("highlight" as const) : ("context" as const),
    paths: rings.map((ring) => {
      const pts = ring.map(toSvg);
      return `M ${pts.join(" L ")} Z`;
    }),
  }));

  const highlightRings = zipBoundaries
    .filter((z) => highlightZips.has(z.zip))
    .flatMap((z) => z.rings);
  let hMinLon = Infinity,
    hMinLat = Infinity,
    hMaxLon = -Infinity,
    hMaxLat = -Infinity;
  for (const ring of highlightRings) {
    for (const [lon, lat] of ring) {
      if (lon < hMinLon) hMinLon = lon;
      if (lon > hMaxLon) hMaxLon = lon;
      if (lat < hMinLat) hMinLat = lat;
      if (lat > hMaxLat) hMaxLat = lat;
    }
  }

  const highlightCx =
    highlightRings.length > 0
      ? offsetX + ((hMinLon + hMaxLon) / 2 - minLon) * scale
      : w / 2;
  const highlightCy =
    highlightRings.length > 0
      ? offsetY + (maxLat - (hMinLat + hMaxLat) / 2) * scale
      : h / 2;

  return {
    layers,
    highlightCx,
    highlightCy,
    projection: { minLon, maxLon, minLat, maxLat, scale, offsetX, offsetY },
  };
}

const W = 220;
const H = 160;

interface Props {
  /** Primary zip to highlight (gold). Omit when using highlightTown. */
  highlightZip?: string;
  /** All zips in a town highlighted (gold); neighbor town zips shown in grey. */
  highlightTown?: TmreTown;
  /** Other zips to show in grey behind the highlight (zip mode only). */
  contextZips?: readonly string[];
  anchorEl: HTMLElement | null;
}

export default function ZipBoundaryPopover({
  highlightZip,
  highlightTown,
  contextZips = [],
  anchorEl,
}: Props) {
  const highlightZipSet = useMemo(() => {
    if (highlightTown) return new Set<string>(zipsForTown(highlightTown));
    if (highlightZip) return new Set([highlightZip]);
    return new Set<string>();
  }, [highlightTown, highlightZip]);

  const resolvedContextZips = useMemo(() => {
    if (highlightTown) return zipsForNeighborTowns(highlightTown);
    return contextZips.filter((z) => !highlightZipSet.has(z));
  }, [highlightTown, contextZips, highlightZipSet]);

  const loadKey = highlightTown
    ? `town:${highlightTown}`
    : highlightZip
      ? `zip:${highlightZip}:${resolvedContextZips.join(",")}`
      : "";

  const badgeLabel = highlightTown ?? highlightZip ?? "";
  const borderingTowns = highlightTown ? neighborTownsFor(highlightTown) : [];
  const zipFooterSubtext =
    resolvedContextZips.length > 0 ? "Surrounding areas in grey" : "Coverage area";

  const [boundary, setBoundary] = useState<BoundaryState>({ status: "idle" });
  const [pos, setPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const popH = H + 48;
    const placeAbove = rect.top >= popH + 8;
    const top = placeAbove ? rect.top - popH - 8 : rect.bottom + 8;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - W / 2),
      window.innerWidth - W - 8,
    );
    setPos({ top, left, placeAbove });
  }, [anchorEl]);

  const contextKey = contextZips.join(",");

  useEffect(() => {
    if (!loadKey) return;

    const highlightZips = highlightTown
      ? [...zipsForTown(highlightTown)]
      : highlightZip
        ? [highlightZip]
        : [];
    const highlightSet = new Set(highlightZips);
    if (highlightSet.size === 0) return;

    const bundled = boundaryBundleCache.get(loadKey);
    if (bundled) {
      setBoundary({ status: "ready", byZip: bundled });
      return;
    }

    const contextList = highlightTown
      ? [...zipsForNeighborTowns(highlightTown)]
      : contextZips.filter((z) => !highlightSet.has(z));
    const zipsToLoad = [
      ...highlightZips,
      ...contextList.filter((z) => !highlightSet.has(z)),
    ];

    const fromRingCache = new Map<string, Ring[]>();
    let allCached = true;
    for (const zip of zipsToLoad) {
      const rings = cache.get(zip);
      if (rings?.length) fromRingCache.set(zip, rings);
      else allCached = false;
    }
    const hasHighlightCached = highlightZips.some((z) => fromRingCache.has(z));
    if (allCached && hasHighlightCached) {
      boundaryBundleCache.set(loadKey, fromRingCache);
      setBoundary({ status: "ready", byZip: fromRingCache });
      return;
    }

    let cancelled = false;
    setBoundary({ status: "loading" });

    Promise.all(
      zipsToLoad.map(async (zip) => {
        try {
          const rings = await fetchBoundary(zip);
          return { zip, rings, ok: true as const };
        } catch {
          return { zip, rings: [] as Ring[], ok: false as const };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const hasHighlight = results.some(
        (r) => highlightSet.has(r.zip) && r.ok && r.rings.length > 0,
      );
      if (!hasHighlight) {
        setBoundary({ status: "error" });
        return;
      }
      const byZip = new Map<string, Ring[]>();
      for (const { zip, rings, ok } of results) {
        if (ok && rings.length) byZip.set(zip, rings);
      }
      boundaryBundleCache.set(loadKey, byZip);
      setBoundary({ status: "ready", byZip });
    });

    return () => {
      cancelled = true;
    };
  }, [loadKey, highlightTown, highlightZip, contextKey]);

  if (!pos || typeof document === "undefined") return null;

  const zipBoundaries =
    boundary.status === "ready"
      ? [...boundary.byZip.entries()].map(([zip, rings]) => ({ zip, rings }))
      : [];

  const { layers, projection } =
    boundary.status === "ready"
      ? projectMultipleZips(zipBoundaries, highlightZipSet, W, H)
      : { layers: [], projection: null };

  const neighborLabels =
    highlightTown && boundary.status === "ready" && projection
      ? borderingTowns
          .map((town) => {
            const rings = zipsForTown(town).flatMap((zip) => boundary.byZip.get(zip) ?? []);
            const center = ringBBoxCenter(rings);
            if (!center) return null;
            const [lon, lat] = center;
            const cx = projection.offsetX + (lon - projection.minLon) * projection.scale;
            const cy = projection.offsetY + (projection.maxLat - lat) * projection.scale;
            return { town, cx, cy };
          })
          .filter((entry): entry is { town: TmreTown; cx: number; cy: number } => entry != null)
      : [];

  const zipLabels =
    !highlightTown && boundary.status === "ready" && projection
      ? zipBoundaries
          .filter(({ zip }) => zip !== highlightZip)
          .map(({ zip, rings }) => {
            const center = ringBBoxCenter(rings);
            if (!center) return null;
            const [lon, lat] = center;
            const cx = projection.offsetX + (lon - projection.minLon) * projection.scale;
            const cy = projection.offsetY + (projection.maxLat - lat) * projection.scale;
            return { zip, cx, cy };
          })
          .filter((entry): entry is { zip: string; cx: number; cy: number } => entry != null)
      : [];

  const contextLayers = layers.filter((l) => l.role === "context");
  const highlightLayers = layers.filter((l) => l.role === "highlight");
  const patternId = `zip-grid-${loadKey.replace(/[^a-z0-9]+/gi, "-")}`;

  return createPortal(
    <div
      ref={popoverRef}
      role="tooltip"
      style={{ top: pos.top, left: pos.left, width: W, zIndex: 9999 }}
      className="fixed pointer-events-none"
    >
      <div className="rounded-2xl bg-white border border-charcoal/10 shadow-2xl shadow-black/25 overflow-hidden">
        <div className="relative bg-slate-50" style={{ height: H }}>
          {badgeLabel ? (
            <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
              <span className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-navy/90 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 border border-charcoal/10 shadow-sm">
                {badgeLabel}
              </span>
            </div>
          ) : null}
          {boundary.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            </div>
          )}
          {boundary.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <span className="font-mono text-[10px] text-slate text-center">
                Boundary unavailable
              </span>
            </div>
          )}
          {boundary.status === "ready" && (
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
              <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.6" fill="rgba(15,23,42,0.08)" />
              </pattern>
              <rect width={W} height={H} fill={`url(#${patternId})`} />

              {contextLayers.flatMap((layer) =>
                layer.paths.map((d, i) => (
                  <path
                    key={`ctx-fill-${layer.zip}-${i}`}
                    d={d}
                    fill="rgba(148,163,184,0.18)"
                  />
                )),
              )}

              {contextLayers.flatMap((layer) =>
                layer.paths.map((d, i) => (
                  <path
                    key={`ctx-stroke-${layer.zip}-${i}`}
                    d={d}
                    fill="none"
                    stroke="rgba(100,116,139,0.55)"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                )),
              )}

              {highlightLayers.flatMap((layer) =>
                layer.paths.map((d, i) => (
                  <path
                    key={`hi-fill-${layer.zip}-${i}`}
                    d={d}
                    fill="rgba(212,175,55,0.28)"
                  />
                )),
              )}

              {highlightLayers.flatMap((layer) =>
                layer.paths.map((d, i) => (
                  <path
                    key={`hi-stroke-${layer.zip}-${i}`}
                    d={d}
                    fill="none"
                    stroke="#B8941F"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                )),
              )}

              {neighborLabels.map(({ town, cx, cy }) => (
                <text
                  key={town}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="monospace"
                  fontSize="7"
                  fontWeight="500"
                  fill="rgba(71,85,105,0.9)"
                  letterSpacing="0.4"
                >
                  {town}
                </text>
              ))}

              {zipLabels.map(({ zip, cx, cy }) => (
                <text
                  key={`zip-${zip}`}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="monospace"
                  fontSize="6.5"
                  fontWeight="600"
                  fill="rgba(15,23,42,0.88)"
                  letterSpacing="0.3"
                >
                  {zip}
                </text>
              ))}
            </svg>
          )}
        </div>
        <div className="px-3 py-2 border-t border-charcoal/[0.08] bg-white">
          {highlightTown ? (
            borderingTowns.length > 0 ? (
              <p className="font-mono text-[8px] leading-snug tracking-[0.06em] text-slate/55 text-center">
                {borderingTowns.join(" · ")}
              </p>
            ) : null
          ) : (
            <p className="font-mono text-[8px] leading-snug tracking-[0.06em] text-slate/55 text-center">
              {zipFooterSubtext}
            </p>
          )}
        </div>
      </div>
      <span
        className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
        style={
          pos.placeAbove
            ? { bottom: -8, borderTopColor: "rgb(255 255 255)" }
            : { top: -8, borderBottomColor: "rgb(255 255 255)" }
        }
      />
    </div>,
    document.body,
  );
}
