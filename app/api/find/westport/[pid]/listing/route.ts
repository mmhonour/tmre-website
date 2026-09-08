import { NextRequest, NextResponse } from 'next/server'
import { getVisionAddress } from '@/lib/db/vision-addresses-repo'
import { findListingInDbByVisionAddress } from '@/lib/find-listing-ingest'
import {
  ingestStreetListingIfMissing,
  streetListingCardFromListing,
} from '@/lib/street-listing-ingest'
import { readStreetListingIngestProgress } from '@/lib/street-listing-ingest-progress'
import {
  streetListingIngestIsFresh,
  STREET_LISTING_INGEST_IN_FLIGHT,
} from '@/lib/street-listing-ingest-progress-shared'

const TOWN = 'Westport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

async function foundPayload(town: string, visionPid: string) {
  const vision = await getVisionAddress(town, visionPid)
  if (!vision) return null
  const listing = await findListingInDbByVisionAddress(vision)
  if (!listing) return null
  return {
    ok: true,
    town,
    visionPid,
    phase: 'found' as const,
    message: listing.status || 'Listing is available',
    listing: streetListingCardFromListing(listing, town),
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ pid: string }> },
) {
  const visionPid = (await ctx.params).pid.trim()
  if (!visionPid) return json({ error: 'pid is required' }, 400)
  const found = await foundPayload(TOWN, visionPid)
  if (found) return json(found)

  const progress = await readStreetListingIngestProgress(TOWN, visionPid)
  if (progress && (streetListingIngestIsFresh(progress) || progress.listing)) {
    return json({
      ok: true,
      town: TOWN,
      visionPid,
      phase: progress.phase,
      message: progress.message,
      listing: progress.listing,
    })
  }

  return json({
    ok: true,
    town: TOWN,
    visionPid,
    phase: null,
    message: null,
    listing: null,
  })
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ pid: string }> },
) {
  const visionPid = (await ctx.params).pid.trim()
  if (!visionPid) return json({ error: 'pid is required' }, 400)

  const found = await foundPayload(TOWN, visionPid)
  if (found) return json({ ...found, started: false, ingested: false })

  const existing = await readStreetListingIngestProgress(TOWN, visionPid)
  if (
    existing &&
    STREET_LISTING_INGEST_IN_FLIGHT.has(existing.phase) &&
    streetListingIngestIsFresh(existing)
  ) {
    return json({
      ok: true,
      town: TOWN,
      visionPid,
      phase: existing.phase,
      message: existing.message,
      listing: existing.listing,
      started: false,
    })
  }

  const result = await ingestStreetListingIfMissing(TOWN, visionPid)
  return json({
    ok: true,
    town: TOWN,
    visionPid,
    phase: result.phase,
    message: result.message,
    listing: result.listing,
    ingested: result.ingested,
    started: true,
  })
}
