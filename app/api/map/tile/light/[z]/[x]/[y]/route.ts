import { NextResponse } from "next/server";
import {
  MAP_LIGHT_TILE_MAX_ZOOM,
  esriLightGrayTileUrl,
} from "@/lib/web-mercator-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quiet street canvas (Esri World Light Gray). Path-based so Netlify Edge
 * does not collapse tiles the way a `?style=` query would.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: zs, x: xs, y: ys } = await ctx.params;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);

  if (
    !Number.isInteger(z) ||
    z < 1 ||
    z > MAP_LIGHT_TILE_MAX_ZOOM
  ) {
    return NextResponse.json({ error: "invalid zoom" }, { status: 400 });
  }
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= n) {
    return NextResponse.json({ error: "invalid tile" }, { status: 400 });
  }
  const wrappedX = ((x % n) + n) % n;

  const res = await fetch(esriLightGrayTileUrl(z, wrappedX, y), {
    headers: { "User-Agent": "TMRE Website map preview" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
