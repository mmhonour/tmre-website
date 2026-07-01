import { NextResponse } from "next/server";

export const runtime = "nodejs";

function tileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const z = Number(searchParams.get("z") ?? "15");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }
  if (!Number.isInteger(z) || z < 1 || z > 18) {
    return NextResponse.json({ error: "invalid zoom" }, { status: 400 });
  }

  const { x, y } = tileXY(lat, lon, z);
  const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

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
