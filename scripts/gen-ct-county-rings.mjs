/**
 * Regenerate lib/ct-county-boundary-rings.ts from Census TIGERweb State_County.
 * Usage: node scripts/gen-ct-county-rings.mjs
 */
import fs from "fs";

const GEOID_TO_ID = {
  "09001": "fairfield",
  "09003": "hartford",
  "09005": "litchfield",
  "09007": "middlesex",
  "09009": "new-haven",
  "09011": "new-london",
  "09013": "tolland",
  "09015": "windham",
};

const URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/55/query" +
  "?where=STATE%3D%2709%27&outFields=BASENAME,GEOID&returnGeometry=true&f=geojson&outSR=4326";

function simplify(ring, maxPts) {
  if (ring.length <= maxPts) return ring;
  const step = (ring.length - 1) / (maxPts - 1);
  const out = [];
  for (let i = 0; i < maxPts - 1; i++) out.push(ring[Math.round(i * step)]);
  out.push(ring[ring.length - 1]);
  return out;
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`TIGERweb HTTP ${res.status}`);
const j = await res.json();

const rounded = {};
for (const f of j.features ?? []) {
  const id = GEOID_TO_ID[f.properties.GEOID];
  if (!id) continue;
  const g = f.geometry;
  const rings =
    g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  rounded[id] = rings.map((r) =>
    simplify(r, 120).map(([lon, lat]) => [
      +Number(lon).toFixed(4),
      +Number(lat).toFixed(4),
    ]),
  );
}

const header = `/**
 * Census TIGER county outer rings (WGS84), simplified for Admin CT coverage
 * thumbnails. Same TIGERweb family as Intelligence ZCTA maps (State_County layer 55).
 * Each county is stored alone so the mini-map can zoom to that county only.
 *
 * Regenerate: node scripts/gen-ct-county-rings.mjs
 */

export type CtCountyRing = [number, number][]

export const CT_COUNTY_BOUNDARY_RINGS: Record<string, CtCountyRing[]> =
`;

const outPath = new URL("../lib/ct-county-boundary-rings.ts", import.meta.url);
fs.writeFileSync(outPath, header + JSON.stringify(rounded) + " as const\n");
console.log("wrote", outPath.pathname, Object.keys(rounded).join(","));
