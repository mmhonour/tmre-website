import { CT_COUNTY_BOUNDARY_RINGS } from "@/lib/ct-county-boundary-rings";

const VIEW_W = 100;
const VIEW_H = 72;
const PAD = 4;

type Ring = [number, number][];

function projectRings(rings: Ring[]): string[] {
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
  const scaleX = (VIEW_W - PAD * 2) / (maxLon - minLon || 1);
  const scaleY = (VIEW_H - PAD * 2) / (maxLat - minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = PAD + (VIEW_W - PAD * 2 - (maxLon - minLon) * scale) / 2;
  const offsetY = PAD + (VIEW_H - PAD * 2 - (maxLat - minLat) * scale) / 2;

  return rings.map((ring) => {
    const pts = ring.map(([lon, lat]) => {
      const x = offsetX + (lon - minLon) * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${pts.join(" L ")} Z`;
  });
}

/**
 * Census TIGER county outline (same source family as Intelligence ZCTA maps),
 * zoomed to this county only — not a full-state cartoon with one county tinted.
 */
export default function CtCountyMiniMap({
  countyId,
  enabled,
  className = "",
}: {
  countyId: string;
  /** At least one town active in this county. */
  enabled: boolean;
  className?: string;
}) {
  const rings = CT_COUNTY_BOUNDARY_RINGS[countyId];
  if (!rings?.length) {
    return (
      <div
        className={`shrink-0 rounded border border-charcoal/20 bg-cream ${className}`}
        aria-label={`${countyId} County map unavailable`}
      />
    );
  }

  const paths = projectRings(rings);
  const fill = enabled ? "rgba(212,175,55,0.32)" : "rgba(148,163,184,0.16)";
  const stroke = enabled ? "#B8941F" : "rgba(100,116,139,0.65)";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`shrink-0 overflow-hidden bg-slate-50 ${className}`}
      role="img"
      aria-label={`${countyId} County map${enabled ? ", enabled" : ""}`}
    >
      {paths.map((d, i) => (
        <path
          key={`fill-${i}`}
          d={d}
          fill={fill}
          stroke="none"
        />
      ))}
      {paths.map((d, i) => (
        <path
          key={`stroke-${i}`}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
