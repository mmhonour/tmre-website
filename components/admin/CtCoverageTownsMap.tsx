"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocationEstimateGridPaint } from "@/components/admin/use-location-estimate-grid-paint";
import {
  loadZipBoundariesForZips,
  prefetchAllTownBoundaries,
  prefetchTownBoundaries,
} from "@/components/ZipBoundaryPopover";
import { TOWN_CENTERS, ZIP_CENTERS } from "@/lib/tmre-geo";
import {
  TOWN_CENTER_RADIUS_MILES,
  cellCenter,
  cellKey,
  cellRing,
  cellsForZipRings,
  lonLatToCell,
  suggestCoastalStrips,
  townCenterOwning,
  type CoastalStripIndex,
} from "@/lib/location-estimate-zip-grid-shared";
import {
  ZIP_AREA_NICKNAMES,
  boundaryZipsForTown,
  isTmreTown,
  neighborTownsFor,
  TMRE_TOWNS,
  type TmreTown,
  zipsForAllTowns,
  zipsForNeighborTowns,
  zipsForTown,
} from "@/lib/tmre-towns";

type Coord = [number, number];
type Ring = Coord[];

const ALL_ZIPS = "";
const VIEW_W = 720;
const VIEW_H = 480;
const PAD = 18;
const MILES_PER_DEG_LAT = 69.172;

const STRIP_FILL: Record<CoastalStripIndex, string> = {
  0: "rgba(232, 93, 58, 0.42)",
  1: "rgba(232, 93, 58, 0.28)",
  2: "rgba(232, 93, 58, 0.18)",
  3: "rgba(232, 93, 58, 0.10)",
};

function zipLabel(code: string): string {
  const nick = ZIP_AREA_NICKNAMES[code];
  return nick ? `${code} · ${nick}` : code;
}

function ringBBoxCenter(rings: Ring[]): Coord | null {
  if (rings.length === 0) return null;
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
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

function projectLayers(
  zipBoundaries: { zip: string; rings: Ring[] }[],
  highlightZips: Set<string>,
) {
  const allRings = zipBoundaries.flatMap((z) => z.rings);
  if (allRings.length === 0) {
    return {
      layers: [] as { zip: string; paths: string[]; highlight: boolean }[],
      projection: null as null,
    };
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of allRings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const scaleX = (VIEW_W - PAD * 2) / (maxLon - minLon || 1);
  const scaleY = (VIEW_H - PAD * 2) / (maxLat - minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = PAD + (VIEW_W - PAD * 2 - (maxLon - minLon) * scale) / 2;
  const offsetY = PAD + (VIEW_H - PAD * 2 - (maxLat - minLat) * scale) / 2;

  const toXy = (lon: number, lat: number) => ({
    x: offsetX + (lon - minLon) * scale,
    y: offsetY + (maxLat - lat) * scale,
  });
  const fromXy = (x: number, y: number) => ({
    lon: minLon + (x - offsetX) / scale,
    lat: maxLat - (y - offsetY) / scale,
  });
  const pathFor = (ring: Ring) =>
    `M ${ring.map(([lon, lat]) => {
      const { x, y } = toXy(lon, lat);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" L ")} Z`;

  const toSvg = ([lon, lat]: Coord) => {
    const { x, y } = toXy(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const layers = zipBoundaries.map(({ zip, rings }) => ({
    zip,
    highlight: highlightZips.has(zip),
    paths: rings.map((ring) => `M ${ring.map(toSvg).join(" L ")} Z`),
  }));

  return {
    layers,
    projection: { minLon, maxLon, minLat, maxLat, scale, offsetX, offsetY, toXy, fromXy, pathFor },
  };
}

function TownCenterDisk({
  town,
  toXy,
  labeled,
}: {
  town: TmreTown;
  toXy: (lon: number, lat: number) => { x: number; y: number };
  labeled: boolean;
}) {
  const pt = TOWN_CENTERS[town];
  const c = toXy(pt.lon, pt.lat);
  const edge = toXy(pt.lon, pt.lat + TOWN_CENTER_RADIUS_MILES / MILES_PER_DEG_LAT);
  const r = Math.abs(edge.y - c.y);
  return (
    <g className="pointer-events-none">
      <circle
        cx={c.x}
        cy={c.y}
        r={r}
        fill="rgba(74, 141, 183, 0.18)"
        stroke="rgba(74, 141, 183, 1)"
        strokeWidth={labeled ? 1.8 : 1.2}
        strokeDasharray="6 5"
      />
      <circle cx={c.x} cy={c.y} r={labeled ? 3 : 2} fill="rgba(74, 141, 183, 1)" />
      {labeled ? (
        <text
          x={c.x}
          y={c.y - r - 6}
          textAnchor="middle"
          className="fill-navy"
          style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
        >
          {town}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Same TIGER ZCTA rings as Intelligence / showcase, plus the ¼-mile
 * coastal grid. Zoom a town to paint; a second click on a painted
 * square erases it. Town-center disks override those squares.
 */
export default function CtCoverageTownsMap({
  activeTownNames,
}: {
  /** CT coverage active town display names (matched to TMRE_TOWNS). */
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
    // byZip intentionally omitted — we merge into it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTown]);

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

  const { layers, projection } = useMemo(
    () => projectLayers(zipBoundaries, highlightZips),
    [zipBoundaries, highlightZips],
  );

  const focusRings = useMemo(() => {
    if (!focusTown || !byZip) return [];
    const codes = zip ? [zip] : [...boundaryZipsForTown(focusTown)];
    return codes.flatMap((code) => byZip.get(code) ?? []);
  }, [byZip, focusTown, zip]);

  const townRings = useMemo(() => {
    if (!focusTown || !byZip) return [];
    return boundaryZipsForTown(focusTown).flatMap((code) => byZip.get(code) ?? []);
  }, [byZip, focusTown]);

  const zipCells = useMemo(
    () => (focusRings.length ? cellsForZipRings(focusRings) : []),
    [focusRings],
  );
  const townCells = useMemo(
    () => (townRings.length ? cellsForZipRings(townRings) : []),
    [townRings],
  );

  const paintedKeys = useMemo(() => Object.keys(paint.cells), [paint.cells]);

  const labeledTowns: TmreTown[] = focusTown
    ? [focusTown, ...neighborTownsFor(focusTown)]
    : [...TMRE_TOWNS];

  const townLabels =
    status === "ready" && projection && byZip
      ? labeledTowns
          .map((town) => {
            const rings = zipsForTown(town).flatMap(
              (code) => byZip.get(code) ?? [],
            );
            const center = ringBBoxCenter(rings);
            if (!center) return null;
            const [lon, lat] = center;
            const { x: cx, y: cy } = projection.toXy(lon, lat);
            return { town, cx, cy, active: activeTmre.has(town) };
          })
          .filter(
            (e): e is { town: TmreTown; cx: number; cy: number; active: boolean } =>
              e != null,
          )
      : [];

  const contextLayers = layers.filter((l) => !l.highlight);
  const highlightLayers = layers.filter((l) => l.highlight);

  const onTownActivate = (town: TmreTown) => {
    setFocusTown((prev) => (prev === town ? null : town));
    setZip(ALL_ZIPS);
  };

  const cellAt = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    if (!projection || !focusTown) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((clientY - rect.top) / rect.height) * VIEW_H;
    const { lon, lat } = projection.fromXy(x, y);
    const { i, j } = lonLatToCell(lat, lon);
    if (!zipCells.some((c) => c.i === i && c.j === j)) return null;
    return cellKey(i, j);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal/15 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-charcoal/[0.08] bg-white px-3 py-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/50">
          {focusTown
            ? `${focusTown} · same TIGER ZCTA as Intelligence · click a square again to erase`
            : "TMRE towns · TIGER ZCTA (same rings as showcase / Intelligence) · click a town to paint"}
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
        <div className="flex flex-wrap items-end gap-2 border-b border-charcoal/[0.08] bg-white px-3 py-2">
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
                aria-pressed={paint.brush === value}
                onClick={() => paint.setBrush(value)}
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
            onClick={() =>
              paint.applyPatch(suggestCoastalStrips(townCells, zipCells))
            }
            disabled={status !== "ready" || zipCells.length === 0}
            className="border border-charcoal/15 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-navy hover:bg-navy/10 disabled:opacity-40"
          >
            Paint south shore
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/40">
            {paint.saving
              ? "Saving…"
              : "Drag to paint · click again to erase"}
          </span>
        </div>
      ) : null}

      <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        {status === "loading" && !byZip ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
          </div>
        ) : null}
        {status === "error" && !byZip ? (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <span className="font-mono text-[11px] text-slate text-center">
              Town boundaries unavailable — check zip-boundaries sync.
            </span>
          </div>
        ) : null}
        {layers.length > 0 && projection ? (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className={`absolute inset-0 h-full w-full ${
              focusTown ? "cursor-crosshair touch-none" : ""
            }`}
            role="img"
            aria-label={
              focusTown
                ? `${focusTown} town boundary and coastal grid`
                : "All TMRE towns boundary map"
            }
            onPointerDown={(e) => {
              if (!focusTown) return;
              const key = cellAt(e.clientX, e.clientY, e.currentTarget);
              if (!key) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              e.stopPropagation();
              paint.beginStroke(key);
            }}
            onPointerMove={(e) => {
              if (!focusTown) return;
              const key = cellAt(e.clientX, e.clientY, e.currentTarget);
              if (!key) return;
              paint.continueStroke(key);
            }}
            onPointerUp={() => paint.endStroke()}
            onPointerCancel={() => paint.endStroke()}
          >
            <pattern
              id="ct-coverage-dot"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.6" fill="rgba(15,23,42,0.08)" />
            </pattern>
            <rect width={VIEW_W} height={VIEW_H} fill="url(#ct-coverage-dot)" />

            {contextLayers.flatMap((layer) =>
              layer.paths.map((d, i) => (
                <path
                  key={`ctx-fill-${layer.zip}-${i}`}
                  d={d}
                  fill="rgba(148,163,184,0.16)"
                />
              )),
            )}
            {contextLayers.flatMap((layer) =>
              layer.paths.map((d, i) => (
                <path
                  key={`ctx-stroke-${layer.zip}-${i}`}
                  d={d}
                  fill="none"
                  stroke="rgba(100,116,139,0.5)"
                  strokeWidth={1.1}
                  strokeLinejoin="round"
                />
              )),
            )}

            {highlightLayers.flatMap((layer) => {
              const townForThisZip = TMRE_TOWNS.find((t) =>
                zipsForTown(t).includes(layer.zip),
              );
              return layer.paths.map((d, i) => (
                <path
                  key={`hi-fill-${layer.zip}-${i}`}
                  d={d}
                  fill="rgba(212,175,55,0.22)"
                  className={focusTown ? undefined : "cursor-pointer"}
                  onClick={() => {
                    if (focusTown || !townForThisZip) return;
                    onTownActivate(townForThisZip);
                  }}
                />
              ));
            })}
            {highlightLayers.flatMap((layer) =>
              layer.paths.map((d, i) => (
                <path
                  key={`hi-stroke-${layer.zip}-${i}`}
                  d={d}
                  fill="none"
                  stroke="#B8941F"
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  className="pointer-events-none"
                />
              )),
            )}

            {zipCells.map(({ i, j }) => {
              const key = cellKey(i, j);
              const strip = paint.cells[key];
              const c = cellCenter(i, j);
              const overridden = townCenterOwning(c.lat, c.lon) != null;
              return (
                <path
                  key={key}
                  d={projection.pathFor(cellRing(i, j))}
                  className="pointer-events-none"
                  fill={
                    overridden
                      ? "rgba(74, 141, 183, 0.12)"
                      : strip != null
                        ? STRIP_FILL[strip]
                        : "rgba(26, 39, 68, 0.03)"
                  }
                  stroke={
                    overridden
                      ? "rgba(74, 141, 183, 0.35)"
                      : strip != null
                        ? "rgba(232, 93, 58, 0.85)"
                        : "rgba(26, 39, 68, 0.16)"
                  }
                  strokeWidth={0.8}
                  strokeDasharray={
                    strip != null && !overridden ? "3 2.5" : undefined
                  }
                />
              );
            })}

            {!focusTown
              ? paintedKeys.map((key) => {
                  const [iRaw, jRaw] = key.split(",");
                  const i = Number(iRaw);
                  const j = Number(jRaw);
                  if (!Number.isInteger(i) || !Number.isInteger(j)) return null;
                  const strip = paint.cells[key];
                  if (strip == null) return null;
                  const c = cellCenter(i, j);
                  if (townCenterOwning(c.lat, c.lon)) return null;
                  return (
                    <path
                      key={`overview-${key}`}
                      d={projection.pathFor(cellRing(i, j))}
                      className="pointer-events-none"
                      fill={STRIP_FILL[strip]}
                      stroke="rgba(232, 93, 58, 0.75)"
                      strokeWidth={0.6}
                    />
                  );
                })
              : null}

            {focusTown
              ? (zip ? [zip] : [...boundaryZipsForTown(focusTown)]).map((code) => {
                  const pt = ZIP_CENTERS[code];
                  if (!pt) return null;
                  const { x, y } = projection.toXy(pt.lon, pt.lat);
                  return (
                    <text
                      key={`zip-label-${code}`}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      className="pointer-events-none fill-navy/70"
                      style={{
                        fontSize: 10,
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {zipLabel(code)}
                    </text>
                  );
                })
              : null}

            {(focusTown ? [focusTown] : [...TMRE_TOWNS]).map((town) => (
              <TownCenterDisk
                key={`disk-${town}`}
                town={town}
                toXy={projection.toXy}
                labeled={focusTown === town}
              />
            ))}

            {townLabels.map(({ town, cx, cy, active }) => (
              <g
                key={town}
                className="cursor-pointer"
                onClick={() => onTownActivate(town)}
              >
                <rect
                  x={cx - town.length * 2.6 - 4}
                  y={cy - 8}
                  width={town.length * 5.2 + 8}
                  height={16}
                  rx={3}
                  fill={
                    focusTown === town
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.82)"
                  }
                  stroke={
                    focusTown === town
                      ? "#B8941F"
                      : active
                        ? "rgba(184,148,31,0.45)"
                        : "rgba(100,116,139,0.35)"
                  }
                  strokeWidth={1}
                />
                <text
                  x={cx}
                  y={cy + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="ui-monospace, monospace"
                  fontSize={focusTown ? 11 : 9}
                  fontWeight={600}
                  fill={
                    active || focusTown === town
                      ? "#1B2A4A"
                      : "rgba(71,85,105,0.85)"
                  }
                  letterSpacing="0.4"
                >
                  {town}
                </text>
              </g>
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
