import { NextRequest, NextResponse } from 'next/server'
import { getZipBoundaryRings } from '@/lib/zip-boundary-cache'
import { hasZctaBoundary } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve ZCTA outer rings from Postgres (`zip_boundaries`).
 * Genuine gaps are filled from Census TIGERweb within a short budget; zips
 * without a ZCTA (PO-box zips) are reported as unmappable rather than fetched.
 *
 * GET /api/zip-boundaries?zips=06880,06840
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('zips') ?? ''
  const zips = raw
    .split(/[,\s]+/)
    .map((z) => z.trim())
    .filter((z) => /^\d{5}$/.test(z))

  if (zips.length === 0) {
    return NextResponse.json(
      { error: 'Pass ?zips=06880 or comma-separated 5-digit ZIPs' },
      { status: 400 },
    )
  }

  // Cap to keep response/size bounded (All Towns + neighbors is well under this).
  const limited = zips.slice(0, 40)
  const unmappable = limited.filter((zip) => !hasZctaBoundary(zip))
  const { rings, missing, complete } = await getZipBoundaryRings(limited, {
    fetchMissing: true,
  })

  const boundaries: Record<string, [number, number][][]> = {}
  for (const [zip, ringList] of rings) {
    boundaries[zip] = ringList
  }

  return NextResponse.json(
    { boundaries, unmappable, missing },
    {
      headers: {
        // Boundaries change rarely, so a complete answer caches hard. An
        // incomplete one must not be pinned for a day — that turned a single
        // slow Census call into 24 hours of blank maps.
        'Cache-Control': complete
          ? 'public, max-age=86400, stale-while-revalidate=604800'
          : 'no-store',
      },
    },
  )
}
