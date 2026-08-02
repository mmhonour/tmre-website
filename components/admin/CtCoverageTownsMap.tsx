"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadZipBoundariesForZips,
  prefetchAllTownBoundaries,
  prefetchTownBoundaries,
} from "@/components/ZipBoundaryPopover";
import {
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

const VIEW_W = 640;
const VIEW_H = 420;
const PAD = 18;

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
    return { layers: [] as { zip: string; paths: string[]; highlight: boolean }[], projection: null };
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

  const toSvg = ([lon, lat]: Coord) => {
    const x = offsetX + (lon - minLon) * scale;
    const y = offsetY + (maxLat - lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const layers = zipBoundaries.map(({ zip, rings }) => ({
    zip,
    highlight: highlightZips.has(zip),
    paths: rings.map((ring) => `M ${ring.map(toSvg).join(" L ")} Z`),
  }));

  return {
    layers,
    projection: { minLon, maxLon, minLat, maxLat, scale, offsetX, offsetY },
  };
}

/**
 * Intelligence “All towns” style map for Admin CT Coverage — larger, with
 * town demarcations and click-in / click-out focus.
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
  const [byZip, setByZip] = useState<Map<string, Ring[]> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);

  useEffect(() => {
    if (focusTown) prefetchTownBoundaries(focusTown);
  }, [focusTown]);

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
          for (const [zip, rings] of map) next.set(zip, rings);
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
    if (focusTown) return new Set<string>(zipsForTown(focusTown));
    return new Set<string>(zipsForAllTowns());
  }, [focusTown]);

  const zipBoundaries = useMemo(() => {
    if (!byZip) return [];
    const zips = focusTown
      ? [...zipsForTown(focusTown), ...zipsForNeighborTowns(focusTown)]
      : [...zipsForAllTowns()];
    return zips
      .map((zip) => {
        const rings = byZip.get(zip);
        return rings?.length ? { zip, rings } : null;
      })
      .filter((z): z is { zip: string; rings: Ring[] } => z != null);
  }, [byZip, focusTown]);

  const { layers, projection } = useMemo(
    () => projectLayers(zipBoundaries, highlightZips),
    [zipBoundaries, highlightZips],
  );

  const labeledTowns: TmreTown[] = focusTown
    ? [focusTown, ...neighborTownsFor(focusTown)]
    : [...TMRE_TOWNS];

  const townLabels =
    status === "ready" && projection && byZip
      ? labeledTowns
          .map((town) => {
            const rings = zipsForTown(town).flatMap(
              (zip) => byZip.get(zip) ?? [],
            );
            const center = ringBBoxCenter(rings);
            if (!center) return null;
            const [lon, lat] = center;
            const cx =
              projection.offsetX +
              (lon - projection.minLon) * projection.scale;
            const cy =
              projection.offsetY +
              (projection.maxLat - lat) * projection.scale;
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
  };

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal/15 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-charcoal/[0.08] bg-white px-3 py-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/50">
          {focusTown
            ? `${focusTown} · click again or All towns to zoom out`
            : "TMRE towns · click a town to zoom in"}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setFocusTown(null)}
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
        {layers.length > 0 ? (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={
              focusTown
                ? `${focusTown} town boundary map`
                : "All TMRE towns boundary map"
            }
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
              const townForZip = TMRE_TOWNS.find((t) =>
                zipsForTown(t).includes(layer.zip),
              );
              return layer.paths.map((d, i) => (
                <path
                  key={`hi-fill-${layer.zip}-${i}`}
                  d={d}
                  fill="rgba(212,175,55,0.3)"
                  className="cursor-pointer"
                  onClick={() => {
                    if (!townForZip) return;
                    onTownActivate(townForZip);
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

            {townLabels.map(({ town, cx, cy, active }) => (
              <g key={town} className="cursor-pointer" onClick={() => onTownActivate(town)}>
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
                  fill={active || focusTown === town ? "#1B2A4A" : "rgba(71,85,105,0.85)"}
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
