"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadZipBoundariesForZips } from "@/components/ZipBoundaryPopover";
import { TOWN_CENTERS, ZIP_CENTERS } from "@/lib/tmre-geo";
import {
  LOCATION_ESTIMATE_GRID_CHANGED_EVENT,
  TOWN_CENTER_RADIUS_MILES,
  cellCenter,
  cellKey,
  cellRing,
  cellsForZipRings,
  lonLatToCell,
  suggestCoastalStrips,
  townCenterOwning,
  type CoastalStripIndex,
  type ZipGridCells,
} from "@/lib/location-estimate-zip-grid-shared";
import {
  TMRE_TOWNS,
  ZIP_AREA_NICKNAMES,
  boundaryZipsForTown,
  type TmreTown,
  townForZip,
  zipsForTown,
} from "@/lib/tmre-towns";

type Ring = [number, number][];
type Brush = CoastalStripIndex | "erase";

const ALL_ZIPS = "";
const VIEW_W = 720;
const VIEW_H = 520;
const PAD = 16;

const STRIP_FILL: Record<CoastalStripIndex, string> = {
  0: "rgba(232, 93, 58, 0.42)",
  1: "rgba(232, 93, 58, 0.28)",
  2: "rgba(232, 93, 58, 0.18)",
  3: "rgba(232, 93, 58, 0.10)",
};

function ringsBBox(rings: Ring[]) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function projectRings(rings: Ring[]) {
  const box = ringsBBox(rings);
  const scaleX = (VIEW_W - PAD * 2) / (box.maxLon - box.minLon || 1);
  const scaleY = (VIEW_H - PAD * 2) / (box.maxLat - box.minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX =
    PAD + (VIEW_W - PAD * 2 - (box.maxLon - box.minLon) * scale) / 2;
  const offsetY =
    PAD + (VIEW_H - PAD * 2 - (box.maxLat - box.minLat) * scale) / 2;
  const toXy = (lon: number, lat: number) => ({
    x: offsetX + (lon - box.minLon) * scale,
    y: offsetY + (box.maxLat - lat) * scale,
  });
  const fromXy = (x: number, y: number) => ({
    lon: box.minLon + (x - offsetX) / scale,
    lat: box.maxLat - (y - offsetY) / scale,
  });
  const pathFor = (ring: Ring) =>
    ring
      .map(([lon, lat], i) => {
        const { x, y } = toXy(lon, lat);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  return { box, scale, toXy, fromXy, pathFor };
}

function zipLabel(code: string): string {
  const nick = ZIP_AREA_NICKNAMES[code];
  return nick ? `${code} · ${nick}` : code;
}

/**
 * Paint ¼-mile cells on a zip or the whole town. Town-center radius is
 * drawn on top and overrides those squares on the listing maps.
 */
export default function AdminLocationEstimateGridMap() {
  const [town, setTown] = useState<TmreTown>("Fairfield");
  const [zip, setZip] = useState(ALL_ZIPS);
  const [zipRingsByCode, setZipRingsByCode] = useState<Map<string, Ring[]>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [cells, setCells] = useState<ZipGridCells>({});
  const [brush, setBrush] = useState<Brush>(0);
  const [saving, setSaving] = useState(false);
  const paintRef = useRef(false);
  const pendingRef = useRef<{ patch: ZipGridCells; erase: string[] }>({
    patch: {},
    erase: [],
  });
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const zips = zipsForTown(town);
    if (zip && !zips.includes(zip)) setZip(ALL_ZIPS);
  }, [town, zip]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/location-estimate-zip-grid")
      .then((res) => (res.ok ? res.json() : { cells: {} }))
      .then((data: { cells?: ZipGridCells }) => {
        if (!cancelled && data.cells) setCells(data.cells);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void loadZipBoundariesForZips(boundaryZipsForTown(town))
      .then((map) => {
        if (cancelled) return;
        setZipRingsByCode(map);
        const hasAny = [...map.values()].some((rings) => rings.length > 0);
        setStatus(hasAny ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [town]);

  const flush = useCallback(() => {
    const { patch, erase } = pendingRef.current;
    if (Object.keys(patch).length === 0 && erase.length === 0) return;
    pendingRef.current = { patch: {}, erase: [] };
    setSaving(true);
    void fetch("/api/admin/location-estimate-zip-grid", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch, erase }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { cells?: ZipGridCells } | null) => {
        if (data?.cells) setCells(data.cells);
        window.dispatchEvent(new Event(LOCATION_ESTIMATE_GRID_CHANGED_EVENT));
      })
      .finally(() => setSaving(false));
  }, []);

  const queuePaint = useCallback(
    (key: string) => {
      setCells((cur) => {
        const next = { ...cur };
        if (brush === "erase") {
          delete next[key];
          pendingRef.current.erase.push(key);
          delete pendingRef.current.patch[key];
        } else {
          next[key] = brush;
          pendingRef.current.patch[key] = brush;
          pendingRef.current.erase = pendingRef.current.erase.filter((k) => k !== key);
        }
        return next;
      });
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => flush(), 450);
    },
    [brush, flush],
  );

  const applyPatch = useCallback(
    (patch: ZipGridCells) => {
      if (Object.keys(patch).length === 0) return;
      setCells((cur) => ({ ...cur, ...patch }));
      pendingRef.current.patch = { ...pendingRef.current.patch, ...patch };
      pendingRef.current.erase = pendingRef.current.erase.filter((k) => !(k in patch));
      flush();
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const viewZips = useMemo(
    () => (zip ? [zip] : [...boundaryZipsForTown(town)]),
    [town, zip],
  );
  const rings = useMemo(
    () => viewZips.flatMap((code) => zipRingsByCode.get(code) ?? []),
    [viewZips, zipRingsByCode],
  );
  const townRings = useMemo(
    () =>
      boundaryZipsForTown(town).flatMap((code) => zipRingsByCode.get(code) ?? []),
    [town, zipRingsByCode],
  );
  const projection = useMemo(
    () => (rings.length ? projectRings(rings) : null),
    [rings],
  );
  const zipCells = useMemo(
    () => (rings.length ? cellsForZipRings(rings) : []),
    [rings],
  );
  const townCells = useMemo(
    () => (townRings.length ? cellsForZipRings(townRings) : []),
    [townRings],
  );

  const paintAt = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    if (!projection) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((clientY - rect.top) / rect.height) * VIEW_H;
    const { lon, lat } = projection.fromXy(x, y);
    const { i, j } = lonLatToCell(lat, lon);
    const key = cellKey(i, j);
    if (!zipCells.some((c) => c.i === i && c.j === j)) return;
    queuePaint(key);
  };

  const viewLabel = zip
    ? `${town} ${zipLabel(zip)}`
    : `${town} · all zips`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-charcoal/45">
            Town
          </span>
          <select
            value={town}
            onChange={(e) => {
              setTown(e.target.value as TmreTown);
              setZip(ALL_ZIPS);
            }}
            className="border border-charcoal/15 bg-white px-2 py-1.5 font-mono text-sm text-navy"
          >
            {TMRE_TOWNS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-charcoal/45">
            Zip
          </span>
          <select
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className="border border-charcoal/15 bg-white px-2 py-1.5 font-mono text-sm text-navy"
          >
            <option value={ALL_ZIPS}>All zips in {town}</option>
            {zipsForTown(town).map((z) => (
              <option key={z} value={z}>
                {zipLabel(z)}
                {boundaryZipsForTown(town).includes(z) ? "" : " · no map"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {(
            [
              [0, "Coast"],
              [1, "2nd strip"],
              [2, "3rd"],
              [3, "4th"],
              ["erase", "Erase"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={brush === value}
              onClick={() => setBrush(value)}
              className={`px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                brush === value
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
          onClick={() => applyPatch(suggestCoastalStrips(townCells, zipCells))}
          disabled={status !== "ready" || zipCells.length === 0}
          className="border border-charcoal/15 bg-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-navy hover:bg-navy/10 disabled:opacity-40"
        >
          Paint south shore
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/40">
          {saving ? "Saving…" : "Drag to paint · autosave"}
        </span>
      </div>

      <p className="text-sm text-charcoal/60">
        Each square is ¼ mile. Paint the coastal strips that follow the shore —
        the 2nd strip is ~25% less than the waterfront, and so on. The{" "}
        <span className="font-medium text-navy">{town}</span> town-center disk
        overrides any square it covers. Viewing {viewLabel}.
        {town === "Fairfield" ? (
          <>
            {" "}
            772 Rowland is in 06890 · Southport — keep All zips or switch to
            that zip to mark the shore that covers the subject.
          </>
        ) : null}
        {zip && townForZip(zip) && !boundaryZipsForTown(town).includes(zip) ? (
          <> This zip is PO-box only and has no Census outline.</>
        ) : null}
      </p>

      <div className="overflow-hidden rounded-xl border border-charcoal/[0.08] bg-[#e8e6df]">
        {status === "error" ? (
          <p className="px-4 py-10 text-center text-sm text-charcoal/50">
            Could not load the zip outline.
          </p>
        ) : status === "loading" || !projection ? (
          <p className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-charcoal/40">
            Loading zip…
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-auto w-full cursor-crosshair touch-none"
            onPointerDown={(e) => {
              paintRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              paintAt(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!paintRef.current) return;
              paintAt(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerUp={() => {
              paintRef.current = false;
              flush();
            }}
            onPointerCancel={() => {
              paintRef.current = false;
            }}
          >
            {rings.map((ring, i) => (
              <path
                key={`zip-${i}`}
                d={projection.pathFor(ring)}
                fill="rgba(255,255,255,0.55)"
                stroke="rgba(26, 39, 68, 0.85)"
                strokeWidth={1.6}
              />
            ))}
            {zipCells.map(({ i, j }) => {
              const key = cellKey(i, j);
              const strip = cells[key];
              const path = projection.pathFor(cellRing(i, j));
              const c = cellCenter(i, j);
              const overridden = townCenterOwning(c.lat, c.lon) != null;
              return (
                <path
                  key={key}
                  d={path}
                  fill={
                    overridden
                      ? "rgba(74, 141, 183, 0.12)"
                      : strip != null
                        ? STRIP_FILL[strip]
                        : "rgba(26, 39, 68, 0.02)"
                  }
                  stroke={
                    overridden
                      ? "rgba(74, 141, 183, 0.35)"
                      : strip != null
                        ? "rgba(232, 93, 58, 0.85)"
                        : "rgba(26, 39, 68, 0.18)"
                  }
                  strokeWidth={0.8}
                  strokeDasharray={
                    strip != null && !overridden ? "3 2.5" : undefined
                  }
                />
              );
            })}
            {viewZips.map((code) => {
              const pt = ZIP_CENTERS[code];
              if (!pt) return null;
              const { x, y } = projection.toXy(pt.lon, pt.lat);
              return (
                <text
                  key={`zip-label-${code}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="fill-navy/70"
                  style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
                >
                  {zipLabel(code)}
                </text>
              );
            })}
            <TownCenterSvg town={town} toXy={projection.toXy} />
          </svg>
        )}
      </div>
    </div>
  );
}

function TownCenterSvg({
  town,
  toXy,
}: {
  town: TmreTown;
  toXy: (lon: number, lat: number) => { x: number; y: number };
}) {
  const pt = TOWN_CENTERS[town];
  const c = toXy(pt.lon, pt.lat);
  const edge = toXy(pt.lon, pt.lat + TOWN_CENTER_RADIUS_MILES / 69.172);
  const r = Math.abs(edge.y - c.y);
  return (
    <g>
      <circle
        cx={c.x}
        cy={c.y}
        r={r}
        fill="rgba(74, 141, 183, 0.18)"
        stroke="rgba(74, 141, 183, 1)"
        strokeWidth={1.8}
        strokeDasharray="6 5"
      />
      <circle cx={c.x} cy={c.y} r={3} fill="rgba(74, 141, 183, 1)" />
      <text
        x={c.x}
        y={c.y - r - 6}
        textAnchor="middle"
        className="fill-navy"
        style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
      >
        {town}
      </text>
    </g>
  );
}
