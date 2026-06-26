"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Ring = [number, number][];

type BoundaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rings: Ring[] }
  | { status: "error" };

const cache = new Map<string, Ring[]>();

async function fetchBoundary(zip: string): Promise<Ring[]> {
  if (cache.has(zip)) return cache.get(zip)!;

  const url =
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/` +
    `PUMA_TAD_TAZ_UGA_ZCTA/MapServer/2/query` +
    `?where=ZCTA5CE10%3D'${zip}'&outFields=ZCTA5CE10` +
    `&returnGeometry=true&f=geojson&outSR=4326`;

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const rings: Ring[] = [];
  for (const feature of data.features ?? []) {
    const { type, coordinates } = feature.geometry;
    if (type === "Polygon") {
      rings.push(coordinates[0] as Ring);
    } else if (type === "MultiPolygon") {
      for (const poly of coordinates as Ring[][]) {
        rings.push(poly[0]);
      }
    }
  }
  cache.set(zip, rings);
  return rings;
}

function projectRings(
  rings: Ring[],
  w: number,
  h: number,
  pad = 12,
): { paths: string[]; cx: number; cy: number } {
  if (rings.length === 0) return { paths: [], cx: w / 2, cy: h / 2 };

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
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

  function toSvg([lon, lat]: [number, number]): string {
    const x = offsetX + (lon - minLon) * scale;
    const y = offsetY + (maxLat - lat) * scale; // flip Y
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }

  const paths = rings.map((ring) => {
    const pts = ring.map(toSvg);
    return `M ${pts.join(" L ")} Z`;
  });

  const cx = offsetX + ((maxLon - minLon) * scale) / 2;
  const cy = offsetY + ((maxLat - minLat) * scale) / 2;

  return { paths, cx, cy };
}

const W = 220;
const H = 160;

interface Props {
  zip: string;
  anchorEl: HTMLElement | null;
}

export default function ZipBoundaryPopover({ zip, anchorEl }: Props) {
  const [boundary, setBoundary] = useState<BoundaryState>({ status: "idle" });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position above/below anchor
  useEffect(() => {
    if (!anchorEl) { setPos(null); return; }
    const rect = anchorEl.getBoundingClientRect();
    const spaceAbove = rect.top;
    const popH = H + 48;
    const top =
      spaceAbove >= popH + 8
        ? rect.top - popH - 8
        : rect.bottom + 8;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - W / 2),
      window.innerWidth - W - 8,
    );
    setPos({ top: top + window.scrollY, left });
  }, [anchorEl]);

  // Fetch boundary
  useEffect(() => {
    if (!zip) return;
    setBoundary({ status: "loading" });
    fetchBoundary(zip)
      .then((rings) => setBoundary({ status: "ready", rings }))
      .catch(() => setBoundary({ status: "error" }));
  }, [zip]);

  if (!pos || typeof document === "undefined") return null;

  const { paths, cx, cy } =
    boundary.status === "ready"
      ? projectRings(boundary.rings, W, H)
      : { paths: [], cx: W / 2, cy: H / 2 };

  return createPortal(
    <div
      ref={popoverRef}
      role="tooltip"
      style={{ top: pos.top, left: pos.left, width: W, zIndex: 60 }}
      className="fixed pointer-events-none"
    >
      <div className="rounded-2xl bg-navy border border-white/10 shadow-2xl shadow-navy/40 overflow-hidden">
        <div className="relative" style={{ height: H }}>
          {boundary.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            </div>
          )}
          {boundary.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[10px] text-white/40">Boundary unavailable</span>
            </div>
          )}
          {boundary.status === "ready" && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              aria-hidden
            >
              {/* Subtle grid dots */}
              <pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.6" fill="rgba(255,255,255,0.06)" />
              </pattern>
              <rect width={W} height={H} fill="url(#grid)" />

              {/* Fill */}
              {paths.map((d, i) => (
                <path key={i} d={d} fill="rgba(212,175,55,0.08)" />
              ))}

              {/* Outline */}
              {paths.map((d, i) => (
                <path
                  key={`s${i}`}
                  d={d}
                  fill="none"
                  stroke="#D4AF37"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              ))}

              {/* Zip label */}
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="monospace"
                fontSize="11"
                fontWeight="600"
                fill="rgba(255,255,255,0.55)"
                letterSpacing="2"
              >
                {zip}
              </text>
            </svg>
          )}
        </div>
        <div className="px-3 py-2 border-t border-white/[0.06]">
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 text-center">
            ZIP {zip} · coverage area
          </p>
        </div>
      </div>
      {/* Caret pointing at the button */}
      <span
        className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
        style={
          pos.top < (anchorEl?.getBoundingClientRect().top ?? 0)
            ? { bottom: -8, borderTopColor: "rgba(255,255,255,0.1)" }
            : { top: -8, borderBottomColor: "rgba(255,255,255,0.1)" }
        }
      />
    </div>,
    document.body,
  );
}
