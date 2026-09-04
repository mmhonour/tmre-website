"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocationEstimateGridPaint } from "@/components/admin/use-location-estimate-grid-paint";
import { useLocationEstimateTownCenters } from "@/components/intelligence/use-location-estimate-town-centers";
import {
  loadZipBoundariesForZips,
  prefetchAllTownBoundaries,
  prefetchTownBoundaries,
} from "@/components/ZipBoundaryPopover";
import { ZIP_CENTERS } from "@/lib/tmre-geo";
import {
  TOWN_CENTER_RADIUS_MAX_MILES,
  TOWN_CENTER_RADIUS_MIN_MILES,
  TOWN_CENTER_RADIUS_STEP_MILES,
  clampTownCenterRadius,
  resolveTownCenter,
  townCenterOwningAt,
  type TownCenterPlacement,
} from "@/lib/location-estimate-town-centers-shared";
import {
  cellCenter,
  cellKey,
  cellRing,
  cellsForZipRings,
  lonLatToCell,
  milesBetween,
  parseCellKey,
  pointInRings,
  coastalStripLabel,
  coastalStripMark,
  countSuggestedOverwrite,
  hasSouthWaterShore,
  suggestCoastalStrips,
  type CoastalStripIndex,
} from "@/lib/location-estimate-zip-grid-shared";
import {
  ZIP_AREA_NICKNAMES,
  boundaryZipsForNeighborTowns,
  boundaryZipsForTown,
  isTmreTown,
  neighborTownsFor,
  TMRE_TOWNS,
  type TmreTown,
  zipsForAllTowns,
  zipsForNeighborTowns,
  zipsForTown,
} from "@/lib/tmre-towns";
import {
  MAP_FALLBACK_CENTER,
  MAP_FALLBACK_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  boundsFromRings,
  clampMapZoom,
  fitMapBounds,
  latToWorldY,
  lonToWorldX,
  ringToMapPath,
  screenToLonLat,
  tilesInViewport,
  worldToLonLat,
  type MapLonLat,
  type MapRing,
} from "@/lib/web-mercator-map";

type Ring = MapRing;

const ALL_ZIPS = "";
const MAP_H = 520;
const MILES_PER_DEG_LAT = 69.172;

const STRIP_FILL: Record<CoastalStripIndex, string> = {
  0: "rgba(232, 93, 58, 0.38)",
  1: "rgba(232, 93, 58, 0.26)",
  2: "rgba(232, 93, 58, 0.16)",
  3: "rgba(232, 93, 58, 0.10)",
};

const STRIP_MARK_MIN_PX = 6;
const STRIP_MARK_MAX_PX = 22;
const STRIP_MARK_DEFAULT_PX = 10;

function StripMark({
  lon,
  lat,
  strip,
  viewport,
  zoom,
  fontSize,
}: {
  lon: number;
  lat: number;
  strip: CoastalStripIndex;
  viewport: { left: number; top: number };
  zoom: number;
  fontSize: number;
}) {
  const x = lonToWorldX(lon, zoom) - viewport.left;
  const y = latToWorldY(lat, zoom) - viewport.top;
  return (
    <text
      x={x}
      y={y}
      dy="0.35em"
      textAnchor="middle"
      fill="#1a2744"
      stroke="rgba(255,255,255,0.88)"
      strokeWidth={Math.max(1, fontSize * 0.18)}
      paintOrder="stroke"
      style={{
        fontSize,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: 700,
      }}
    >
      {coastalStripMark(strip)}
    </text>
  );
}

function zipLabel(code: string): string {
  const nick = ZIP_AREA_NICKNAMES[code];
  return nick ? `${code} · ${nick}` : code;
}

/**
 * Intelligence / showcase street tiles (OSM via /api/map/tile) with TIGER
 * ZCTA outlines on top. Zoom a town to paint; a second click erases.
 */
export default function CtCoverageTownsMap({
  activeTownNames,
}: {
  activeTownNames: readonly string[];
}) {
  const activeTmre = useMemo(() => {
    const set = new Set<TmreTown>();
    for (const name of activeTownNames) {
      if (isTmreTown(name)) set.add(name);
    }
    return set;
  }, [activeTownNames]);

  const [focusTown, setFocusTown] = useState<TmreTown | null>(null);
  const [zip, setZip] = useState(ALL_ZIPS);
  const [byZip, setByZip] = useState<Map<string, Ring[]> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const paint = useLocationEstimateGridPaint();
  const townCenters = useLocationEstimateTownCenters();
  const [draftCenter, setDraftCenter] = useState<TownCenterPlacement | null>(
    null,
  );
  const draftRef = useRef<TownCenterPlacement | null>(null);
  draftRef.current = draftCenter;
  const [hoverDisk, setHoverDisk] = useState<"center" | "rim" | null>(null);
  const [townCenterMode, setTownCenterMode] = useState(false);
  const [stripMarkPx, setStripMarkPx] = useState(STRIP_MARK_DEFAULT_PX);

  const livePlacements = useMemo(() => {
    if (!focusTown || !draftCenter) return townCenters.placements;
    return { ...townCenters.placements, [focusTown]: draftCenter };
  }, [draftCenter, focusTown, townCenters.placements]);

  useEffect(() => {
    setDraftCenter(null);
    setTownCenterMode(false);
  }, [focusTown]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: MAP_H });
  const [center, setCenter] = useState<MapLonLat>(MAP_FALLBACK_CENTER);
  const [zoom, setZoom] = useState(MAP_FALLBACK_ZOOM);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  centerRef.current = center;
  zoomRef.current = zoom;
  sizeRef.current = size;
  const fitSigRef = useRef<string | null>(null);
  const dragRef = useRef<{
    mode: "paint" | "pan" | "center" | "rim";
    pointerId: number;
    startX: number;
    startY: number;
    startCenter: MapLonLat;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);

  useEffect(() => {
    if (focusTown) prefetchTownBoundaries(focusTown);
  }, [focusTown]);

  useEffect(() => {
    const zips = focusTown ? zipsForTown(focusTown) : [];
    if (zip && !zips.includes(zip)) setZip(ALL_ZIPS);
  }, [focusTown, zip]);

  useEffect(() => {
    let cancelled = false;
    const zips = focusTown
      ? [...zipsForTown(focusTown), ...zipsForNeighborTowns(focusTown)]
      : [...zipsForAllTowns()];
    setStatus((prev) => (byZip ? prev : "loading"));
    void loadZipBoundariesForZips(zips)
      .then((map) => {
        if (cancelled) return;
        if (map.size === 0) {
          setStatus("error");
          return;
        }
        setByZip((prev) => {
          const next = new Map(prev);
          for (const [code, rings] of map) next.set(code, rings);
          return next;
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTown]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const highlightZips = useMemo(() => {
    if (focusTown && zip) return new Set<string>([zip]);
    if (focusTown) return new Set<string>(zipsForTown(focusTown));
    return new Set<string>(zipsForAllTowns());
  }, [focusTown, zip]);

  const zipBoundaries = useMemo(() => {
    if (!byZip) return [];
    const zips = focusTown
      ? [...zipsForTown(focusTown), ...zipsForNeighborTowns(focusTown)]
      : [...zipsForAllTowns()];
    return zips
      .map((code) => {
        const rings = byZip.get(code);
        return rings?.length ? { zip: code, rings } : null;
      })
      .filter((z): z is { zip: string; rings: Ring[] } => z != null);
  }, [byZip, focusTown]);

  const focusRings = useMemo(() => {
    if (!focusTown || !byZip) return [];
    const codes = zip ? [zip] : [...boundaryZipsForTown(focusTown)];
    return codes.flatMap((code) => byZip.get(code) ?? []);
  }, [byZip, focusTown, zip]);

  const townRings = useMemo(() => {
    if (!focusTown || !byZip) return [];
    return boundaryZipsForTown(focusTown).flatMap((code) => byZip.get(code) ?? []);
  }, [byZip, focusTown]);

  const fitRings = useMemo(() => {
    if (focusRings.length) return focusRings;
    return zipBoundaries.flatMap((z) =>
      highlightZips.has(z.zip) ? z.rings : [],
    );
  }, [focusRings, highlightZips, zipBoundaries]);

  const zipCells = useMemo(
    () => (focusRings.length ? cellsForZipRings(focusRings) : []),
    [focusRings],
  );
  const townCells = useMemo(
    () => (townRings.length ? cellsForZipRings(townRings) : []),
    [townRings],
  );
  const landCells = useMemo(() => {
    if (!byZip || !focusTown) return townCells;
    const rings = [
      ...boundaryZipsForTown(focusTown),
      ...boundaryZipsForNeighborTowns(focusTown),
    ].flatMap((code) => byZip.get(code) ?? []);
    return rings.length ? cellsForZipRings(rings) : townCells;
  }, [byZip, focusTown, townCells]);
  const southShoreSuggestion = useMemo(
    () => suggestCoastalStrips(landCells, zipCells),
    [landCells, zipCells],
  );
  const hasShore = useMemo(
    () => hasSouthWaterShore(landCells, zipCells),
    [landCells, zipCells],
  );
  const shoreOverwriteCount = useMemo(
    () => countSuggestedOverwrite(paint.cells, southShoreSuggestion),
    [paint.cells, southShoreSuggestion],
  );

  const fitArea = `${focusTown ?? "all"}:${zip || "all"}:${fitRings.length}`;

  useEffect(() => {
    if (size.width <= 0 || fitRings.length === 0) return;
    const sig = `${fitArea}:${Math.round(size.width)}x${Math.round(size.height)}`;
    if (fitSigRef.current === sig) return;
    fitSigRef.current = sig;
    const next = fitMapBounds(boundsFromRings(fitRings), size.width, size.height);
    setCenter(next.center);
    setZoom(next.zoom);
  }, [fitArea, fitRings, size.height, size.width]);

  const viewport = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    return {
      left: lonToWorldX(center.lon, zoom) - size.width / 2,
      top: latToWorldY(center.lat, zoom) - size.height / 2,
    };
  }, [center.lat, center.lon, size.height, size.width, zoom]);

  const tileZoom = clampMapZoom(Math.round(zoom));
  const tiles = useMemo(() => {
    if (!viewport || size.width <= 0) return [];
    return tilesInViewport({
      viewport,
      zoom,
      level: tileZoom,
      width: size.width,
      height: size.height,
    });
  }, [size.height, size.width, tileZoom, viewport, zoom]);

  const onTownActivate = (town: TmreTown) => {
    setFocusTown((prev) => (prev === town ? null : town));
    setZip(ALL_ZIPS);
  };

  const townAt = useCallback(
    (lon: number, lat: number): TmreTown | null => {
      if (!byZip) return null;
      for (const town of TMRE_TOWNS) {
        const rings = zipsForTown(town).flatMap((code) => byZip.get(code) ?? []);
        if (pointInRings(lon, lat, rings)) return town;
      }
      return null;
    },
    [byZip],
  );

  const cellAtClient = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el || !focusTown || size.width <= 0) return null;
    const rect = el.getBoundingClientRect();
    const { lon, lat } = screenToLonLat(
      clientX - rect.left,
      clientY - rect.top,
      centerRef.current,
      zoomRef.current,
      sizeRef.current,
    );
    const { i, j } = lonLatToCell(lat, lon);
    if (!zipCells.some((c) => c.i === i && c.j === j)) return null;
    return cellKey(i, j);
  };

  const panBy = (dx: number, dy: number, from: MapLonLat) => {
    const level = zoomRef.current;
    const cx = lonToWorldX(from.lon, level) - dx;
    const cy = latToWorldY(from.lat, level) - dy;
    setCenter(worldToLonLat(cx, cy, level));
  };

  const zoomAround = (nextZoom: number, screenX?: number, screenY?: number) => {
    const panel = sizeRef.current;
    const clamped = clampMapZoom(nextZoom);
    if (Math.abs(clamped - zoomRef.current) < 0.001) return;
    if (screenX == null || screenY == null || panel.width <= 0) {
      setZoom(clamped);
      return;
    }
    const anchor = screenToLonLat(
      screenX,
      screenY,
      centerRef.current,
      zoomRef.current,
      panel,
    );
    const cx = lonToWorldX(anchor.lon, clamped) - (screenX - panel.width / 2);
    const cy = latToWorldY(anchor.lat, clamped) - (screenY - panel.height / 2);
    setCenter(worldToLonLat(cx, cy, clamped));
    setZoom(clamped);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const step = e.ctrlKey
        ? Math.max(-1.5, Math.min(1.5, -e.deltaY * 0.01))
        : e.deltaY < 0
          ? 0.5
          : -0.5;
      zoomAround(zoomRef.current + step, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const diskHitAt = (
    clientX: number,
    clientY: number,
  ): "center" | "rim" | null => {
    if (!focusTown || !viewport) return null;
    const el = containerRef.current;
    if (!el) return null;
    const pt = resolveTownCenter(focusTown, livePlacements);
    const cx = lonToWorldX(pt.lon, zoomRef.current) - viewport.left;
    const cy = latToWorldY(pt.lat, zoomRef.current) - viewport.top;
    const edgeY =
      latToWorldY(
        pt.lat + pt.radiusMiles / MILES_PER_DEG_LAT,
        zoomRef.current,
      ) - viewport.top;
    const r = Math.abs(edgeY - cy);
    const rect = el.getBoundingClientRect();
    const dist = Math.hypot(
      clientX - rect.left - cx,
      clientY - rect.top - cy,
    );
    if (dist <= 14) return "center";
    if (Math.abs(dist - r) <= 12) return "rim";
    return null;
  };

  const lonLatAtClient = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return screenToLonLat(
      clientX - rect.left,
      clientY - rect.top,
      centerRef.current,
      zoomRef.current,
      sizeRef.current,
    );
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const disk = diskHitAt(e.clientX, e.clientY);
    if (focusTown && disk) {
      dragRef.current = {
        mode: disk,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCenter: center,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraftCenter(resolveTownCenter(focusTown, livePlacements));
      setTownCenterMode(true);
      return;
    }
    const key = cellAtClient(e.clientX, e.clientY);
    if (focusTown && key) {
      dragRef.current = {
        mode: "paint",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCenter: center,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      paint.beginStroke(key);
      return;
    }
    dragRef.current = {
      mode: "pan",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      setHoverDisk(diskHitAt(e.clientX, e.clientY));
      return;
    }
    if (drag.mode === "paint") {
      const key = cellAtClient(e.clientX, e.clientY);
      if (key) paint.continueStroke(key);
      return;
    }
    if ((drag.mode === "center" || drag.mode === "rim") && focusTown) {
      const geo = lonLatAtClient(e.clientX, e.clientY);
      if (!geo) return;
      const current = resolveTownCenter(focusTown, livePlacements);
      if (drag.mode === "center") {
        setDraftCenter({ ...current, lat: geo.lat, lon: geo.lon });
      } else {
        setDraftCenter({
          ...current,
          radiusMiles: clampTownCenterRadius(milesBetween(current, geo)),
        });
      }
      return;
    }
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

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.mode === "paint") paint.endStroke();
    else if (drag.mode === "center" || drag.mode === "rim") {
      const next = draftRef.current;
      if (focusTown && next) townCenters.save(focusTown, next);
      setDraftCenter(null);
    } else if (!drag.moved && !focusTown) {
      const pt = lonLatAtClient(e.clientX, e.clientY);
      if (pt) {
        const hit = townAt(pt.lon, pt.lat);
        if (hit) onTownActivate(hit);
      }
    }
    dragRef.current = null;
  };

  const labeledTowns: TmreTown[] = focusTown
    ? [focusTown, ...neighborTownsFor(focusTown)]
    : [...TMRE_TOWNS];

  const townLabels =
    viewport && byZip
      ? labeledTowns
          .map((town) => {
            const pt = resolveTownCenter(town, livePlacements);
            const left = lonToWorldX(pt.lon, zoom) - viewport.left;
            const cy = latToWorldY(pt.lat, zoom) - viewport.top;
            const edgeY =
              latToWorldY(
                pt.lat + pt.radiusMiles / MILES_PER_DEG_LAT,
                zoom,
              ) - viewport.top;
            const radiusPx = Math.abs(edgeY - cy);
            return {
              town,
              left,
              top: cy,
              radiusPx,
              active: activeTmre.has(town),
            };
          })
          .filter(
            (e) =>
              e.left > -40 &&
              e.left < size.width + 40 &&
              e.top > -20 &&
              e.top < size.height + 20,
          )
      : [];

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal/15 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-charcoal/[0.08] px-3 py-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/50">
          {focusTown
            ? `${focusTown} · drag the blue dot to move · drag the rim to resize`
            : "TMRE towns · same street map as Intelligence / showcase · click a town to paint"}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setFocusTown(null);
              setZip(ALL_ZIPS);
            }}
            aria-pressed={focusTown == null}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase transition-colors ${
              focusTown == null
                ? "border-navy/35 bg-navy/5 text-navy"
                : "border-charcoal/15 bg-white text-charcoal/45 hover:border-navy/25 hover:text-navy"
            }`}
          >
            All towns
          </button>
          {TMRE_TOWNS.map((town) => {
            const active = focusTown === town;
            const covered = activeTmre.has(town);
            return (
              <button
                key={town}
                type="button"
                onClick={() => onTownActivate(town)}
                aria-pressed={active}
                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase transition-colors ${
                  active
                    ? "border-gold bg-gold/15 text-navy"
                    : covered
                      ? "border-charcoal/15 bg-white text-navy/70 hover:border-gold/40 hover:text-navy"
                      : "border-charcoal/10 bg-cream/80 text-charcoal/40 hover:border-charcoal/25"
                }`}
              >
                {town}
              </button>
            );
          })}
        </div>
      </div>

      {focusTown ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-charcoal/[0.08] px-3 py-2">
          <label className="space-y-0.5">
            <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45">
              Zip
            </span>
            <select
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[12px] text-navy"
            >
              <option value={ALL_ZIPS}>All zips in {focusTown}</option>
              {zipsForTown(focusTown).map((code) => (
                <option key={code} value={code}>
                  {zipLabel(code)}
                  {boundaryZipsForTown(focusTown).includes(code) ? "" : " · no map"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            {(
              [
                [0, coastalStripLabel(0)],
                [1, coastalStripLabel(1)],
                [2, coastalStripLabel(2)],
                [3, coastalStripLabel(3)],
                ["erase", "Erase"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={paint.brush === value}
                onClick={() => {
                  setTownCenterMode(false);
                  paint.setBrush(value);
                }}
                className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  paint.brush === value
                    ? "bg-navy text-white"
                    : "bg-cream text-navy hover:bg-navy/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            title={
              !hasShore
                ? "Landlocked — no Sound, gulf, or bay on the south edge"
                : shoreOverwriteCount > 0
                  ? `Will overwrite ${shoreOverwriteCount} painted square${
                      shoreOverwriteCount === 1 ? "" : "s"
                    }`
                  : "Seed Coast–4th from the south water edge"
            }
            onClick={() => {
              if (!hasShore) return;
              if (shoreOverwriteCount > 0) {
                const ok = window.confirm(
                  `Paint south shore will overwrite ${shoreOverwriteCount} already-painted square${
                    shoreOverwriteCount === 1 ? "" : "s"
                  } on this ${zip ? "zip" : "town"}. Continue?`,
                );
                if (!ok) return;
              }
              paint.applyPatch(southShoreSuggestion);
            }}
            disabled={
              status !== "ready" ||
              zipCells.length === 0 ||
              !hasShore ||
              Object.keys(southShoreSuggestion).length === 0
            }
            className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-navy hover:bg-navy/10 disabled:opacity-40"
          >
            Paint south shore
          </button>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={townCenterMode}
              onClick={() => setTownCenterMode((on) => !on)}
              className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${
                townCenterMode
                  ? "bg-navy text-white"
                  : "text-charcoal/45 hover:bg-navy/10 hover:text-navy"
              }`}
            >
              Town center
            </button>
            <button
              type="button"
              aria-label="Smaller town-center radius"
              onClick={() => {
                const current = resolveTownCenter(focusTown, livePlacements);
                const next = {
                  ...current,
                  radiusMiles: clampTownCenterRadius(
                    current.radiusMiles - TOWN_CENTER_RADIUS_STEP_MILES,
                  ),
                };
                setTownCenterMode(true);
                townCenters.save(focusTown, next);
              }}
              disabled={
                resolveTownCenter(focusTown, livePlacements).radiusMiles <=
                TOWN_CENTER_RADIUS_MIN_MILES
              }
              className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[10px] text-navy hover:bg-navy/10 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[3.5rem] text-center font-mono text-[11px] text-navy">
              {resolveTownCenter(focusTown, livePlacements).radiusMiles.toFixed(
                2,
              )}{" "}
              mi
            </span>
            <button
              type="button"
              aria-label="Larger town-center radius"
              onClick={() => {
                const current = resolveTownCenter(focusTown, livePlacements);
                const next = {
                  ...current,
                  radiusMiles: clampTownCenterRadius(
                    current.radiusMiles + TOWN_CENTER_RADIUS_STEP_MILES,
                  ),
                };
                setTownCenterMode(true);
                townCenters.save(focusTown, next);
              }}
              disabled={
                resolveTownCenter(focusTown, livePlacements).radiusMiles >=
                TOWN_CENTER_RADIUS_MAX_MILES
              }
              className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[10px] text-navy hover:bg-navy/10 disabled:opacity-40"
            >
              +
            </button>
          <button
            type="button"
            onClick={() => townCenters.reset(focusTown)}
            className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-navy hover:bg-navy/10"
          >
            Reset
          </button>
          </div>
          <label className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-charcoal/45">
              # size
            </span>
            <input
              type="range"
              min={STRIP_MARK_MIN_PX}
              max={STRIP_MARK_MAX_PX}
              step={1}
              value={stripMarkPx}
              onChange={(e) => setStripMarkPx(Number(e.target.value))}
              className="h-1.5 w-24 accent-navy"
              aria-label="Coastal strip number size"
            />
            <span className="min-w-[2.25rem] font-mono text-[11px] text-navy">
              {stripMarkPx}px
            </span>
          </label>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/40">
            {paint.saving || townCenters.saving
              ? "Saving…"
              : townCenterMode
                ? "Grid hidden — click Town center to show it"
                : "Drag the disk or use + / −"}
          </span>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden bg-[#e8e6df] touch-none ${
          hoverDisk === "center"
            ? "cursor-grab"
            : hoverDisk === "rim"
              ? "cursor-ew-resize"
              : focusTown
                ? "cursor-crosshair"
                : "cursor-grab"
        }`}
        style={{ height: MAP_H }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label={
          focusTown
            ? `${focusTown} street map and coastal grid`
            : "All TMRE towns street map"
        }
      >
        {status === "loading" && !byZip ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
          </div>
        ) : null}
        {status === "error" && !byZip ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
            <span className="text-center font-mono text-[11px] text-slate">
              Town boundaries unavailable — check zip-boundaries sync.
            </span>
          </div>
        ) : null}

        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            width={256}
            height={256}
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

        {viewport && size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
            viewBox={`0 0 ${size.width} ${size.height}`}
            aria-hidden
          >
            {zipBoundaries.flatMap(({ zip: code, rings }) => {
              const highlight = highlightZips.has(code);
              return rings.map((ring, i) => {
                const d = ringToMapPath(ring, viewport, zoom);
                if (!d) return null;
                return (
                  <path
                    key={`${code}-${i}`}
                    d={d}
                    fill={
                      highlight ? "rgba(212,175,55,0.10)" : "rgba(15,23,42,0.04)"
                    }
                    stroke={highlight ? "#B8941F" : "rgba(100,116,139,0.55)"}
                    strokeWidth={highlight ? 2 : 1.1}
                    strokeLinejoin="round"
                  />
                );
              });
            })}

            {!townCenterMode
              ? zipCells.map(({ i, j }) => {
              const key = cellKey(i, j);
              const strip = paint.cells[key];
              const c = cellCenter(i, j);
              const overridden =
                townCenterOwningAt(c.lat, c.lon, livePlacements) != null;
              const d = ringToMapPath(cellRing(i, j), viewport, zoom);
              if (!d) return null;
              return (
                <g key={key}>
                  <path
                    d={d}
                    fill={
                      overridden
                        ? "rgba(74, 141, 183, 0.14)"
                        : strip != null
                          ? STRIP_FILL[strip]
                          : "rgba(26, 39, 68, 0.04)"
                    }
                    stroke={
                      overridden
                        ? "rgba(74, 141, 183, 0.45)"
                        : strip != null
                          ? "rgba(232, 93, 58, 0.9)"
                          : "rgba(26, 39, 68, 0.22)"
                    }
                    strokeWidth={0.9}
                    strokeDasharray={
                      strip != null && !overridden ? "4 3" : undefined
                    }
                  />
                  {strip != null && !overridden ? (
                    <StripMark
                      lon={c.lon}
                      lat={c.lat}
                      strip={strip}
                      viewport={viewport}
                      zoom={zoom}
                      fontSize={stripMarkPx}
                    />
                  ) : null}
                </g>
              );
            })
              : null}

            {!focusTown
              ? Object.entries(paint.cells).map(([key, strip]) => {
                  const parsed = parseCellKey(key);
                  if (!parsed) return null;
                  const c = cellCenter(parsed.i, parsed.j);
                  if (townCenterOwningAt(c.lat, c.lon, livePlacements))
                    return null;
                  const d = ringToMapPath(
                    cellRing(parsed.i, parsed.j),
                    viewport,
                    zoom,
                  );
                  if (!d) return null;
                  return (
                    <g key={`overview-${key}`}>
                      <path
                        d={d}
                        fill={STRIP_FILL[strip]}
                        stroke="rgba(232, 93, 58, 0.8)"
                        strokeWidth={0.7}
                      />
                      <StripMark
                        lon={c.lon}
                        lat={c.lat}
                        strip={strip}
                        viewport={viewport}
                        zoom={zoom}
                        fontSize={stripMarkPx}
                      />
                    </g>
                  );
                })
              : null}

            {focusTown
              ? (zip ? [zip] : [...boundaryZipsForTown(focusTown)]).map(
                  (code) => {
                    const pt = ZIP_CENTERS[code];
                    if (!pt) return null;
                    const x = lonToWorldX(pt.lon, zoom) - viewport.left;
                    const y = latToWorldY(pt.lat, zoom) - viewport.top;
                    return (
                      <text
                        key={`zip-label-${code}`}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        className="fill-navy/80"
                        style={{
                          fontSize: 11,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {zipLabel(code)}
                      </text>
                    );
                  },
                )
              : null}

            {(focusTown ? [focusTown] : [...TMRE_TOWNS]).map((town) => {
              const pt = resolveTownCenter(town, livePlacements);
              const cx = lonToWorldX(pt.lon, zoom) - viewport.left;
              const cy = latToWorldY(pt.lat, zoom) - viewport.top;
              const edgeY =
                latToWorldY(
                  pt.lat + pt.radiusMiles / MILES_PER_DEG_LAT,
                  zoom,
                ) - viewport.top;
              const r = Math.abs(edgeY - cy);
              return (
                <g key={`disk-${town}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="rgba(74, 141, 183, 0.16)"
                    stroke="rgba(74, 141, 183, 1)"
                    strokeWidth={focusTown ? 2.2 : 1.2}
                    strokeDasharray="6 5"
                  />
                  {focusTown ? (
                    <circle
                      cx={cx + r}
                      cy={cy}
                      r={5}
                      fill="white"
                      stroke="rgba(74, 141, 183, 1)"
                      strokeWidth={1.6}
                    />
                  ) : null}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={focusTown ? 5 : 2}
                    fill="rgba(74, 141, 183, 1)"
                  />
                </g>
              );
            })}
          </svg>
        ) : null}

        {townLabels.map(({ town, left, top, radiusPx, active }) => {
          const labelHalf = 9;
          const gap = 6;
          const sitsOnDisk = radiusPx > labelHalf;
          return (
          <button
            key={`label-${town}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTownActivate(town);
            }}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm border bg-white/90 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
            style={{
              left,
              top: sitsOnDisk ? top - radiusPx - labelHalf - gap : top - 14,
              borderColor:
                focusTown === town
                  ? "#B8941F"
                  : active
                    ? "rgba(184,148,31,0.45)"
                    : "rgba(100,116,139,0.35)",
              color: active || focusTown === town ? "#1B2A4A" : "rgba(71,85,105,0.85)",
            }}
          >
            {town}
          </button>
          );
        })}

        <div className="absolute left-2 top-2 z-20 flex flex-col overflow-hidden rounded-md border border-white/15 bg-navy/80 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={() => zoomAround(zoom + 1)}
            disabled={zoom >= MAP_MAX_ZOOM - 0.001}
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center font-mono text-sm text-white/80 hover:bg-white/10 hover:text-gold disabled:opacity-30"
          >
            +
          </button>
          <div className="h-px bg-white/10" aria-hidden />
          <button
            type="button"
            onClick={() => zoomAround(zoom - 1)}
            disabled={zoom <= MAP_MIN_ZOOM + 0.001}
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center font-mono text-sm text-white/80 hover:bg-white/10 hover:text-gold disabled:opacity-30"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
