import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy a single OpenStreetMap raster tile by z/x/y path segments.
 * Path-based URLs are required: Netlify Edge’s Netlify-Vary for this app
 * does not include arbitrary query params, so `/api/map/tile?z=&x=&y=`
 * collapses every tile into one cached PNG.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: zs, x: xs, y: ys } = await ctx.params;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);

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
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      // Safe to cache: each z/x/y is a distinct path (CDN key).
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
