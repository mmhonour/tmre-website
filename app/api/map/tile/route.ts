import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy query-string tile URL. Kept only to 308 → path form.
 * Do not serve PNG bodies here: Netlify Edge cached one response for all
 * `?z=&x=&y=` variants (Netlify-Vary omits those query keys).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");

  if (z == null || x == null || y == null) {
    return NextResponse.json({ error: "invalid tile" }, { status: 400 });
  }

  const target = new URL(`/api/map/tile/${z}/${x}/${y}`, req.url);
  return NextResponse.redirect(target, {
    status: 308,
    headers: {
      // Avoid re-poisoning the query-string edge key with another PNG body.
      "Cache-Control": "private, no-store",
    },
  });
}
