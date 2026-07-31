import {
  CT_COUNTY_MAP_ORDER,
  CT_COUNTY_MAP_PATHS,
  CT_COUNTY_MAP_VIEWBOX,
} from "@/lib/ct-county-map-paths";

/**
 * Small CT outline with all counties bordered; focal county filled.
 * Enabled counties use light blue; inactive use cream.
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
  const focusFill = enabled ? "#93c5fd" /* light blue */ : "#f5f0e8"; /* cream */
  const otherFill = "#ffffff";
  const stroke = "#1e3a5f"; /* navy-ish */

  return (
    <svg
      viewBox={CT_COUNTY_MAP_VIEWBOX}
      className={`shrink-0 overflow-visible ${className}`}
      role="img"
      aria-label={`${countyId} County map${enabled ? ", enabled" : ""}`}
    >
      {CT_COUNTY_MAP_ORDER.map((id) => {
        const d = CT_COUNTY_MAP_PATHS[id];
        if (!d) return null;
        const isFocus = id === countyId;
        return (
          <path
            key={id}
            d={d}
            fill={isFocus ? focusFill : otherFill}
            stroke={stroke}
            strokeWidth={isFocus ? 1.6 : 0.9}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
