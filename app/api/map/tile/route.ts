import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy a single OpenStreetMap raster tile by z/x/y.
 * Used by ListingLocationMap’s mosaic so non-square panels never show blank bands.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));

  if (!Number.isInteger(z) || z < 1 || z > 18) {
    return NextResponse.json({ error: "invalid zoom" }, { status: 400 });
  }
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= n) {
    return NextResponse.json({ error: "invalid tile" }, { status: 400 });
  }
  const wrappedX = ((x % n) + n) % n;

  const tileUrl = `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`;
  const res = await fetch(tileUrl, {
    headers: { "User-Agent": "TMRE Website map preview" },
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
