import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  ingestStreetListingIfMissing,
  loadStreetListingCards,
} from '@/lib/street-listing-ingest'
import { getVisionStreetParcelByPid } from '@/lib/db/vision-streets-repo'
import { readStreetListingIngestProgress } from '@/lib/street-listing-ingest-progress'
import {
  streetListingIngestIsFresh,
  STREET_LISTING_INGEST_IN_FLIGHT,
} from '@/lib/street-listing-ingest-progress-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function readTownPid(req: NextRequest, body?: Record<string, unknown>) {
  const url = new URL(req.url)
  const town = String(
    body?.town ?? url.searchParams.get('town') ?? '',
  ).trim()
  const visionPid = String(
    body?.visionPid ?? url.searchParams.get('visionPid') ?? '',
  ).trim()
  return { town, visionPid }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const { town, visionPid } = readTownPid(req)
  if (!town || !visionPid) {
    return json({ error: 'town and visionPid are required' }, 400)
  }

  const parcel = await getVisionStreetParcelByPid(town, visionPid)
  const streetName = parcel?.streetName
  if (streetName) {
    const cards = await loadStreetListingCards(town, streetName)
    const listing = cards.get(visionPid) ?? null
    if (listing) {
      return json({
        ok: true,
        town,
        visionPid,
        phase: 'found',
        message: listing.status,
        listing,
      })
    }
  }

  const progress = await readStreetListingIngestProgress(town, visionPid)
  if (progress && (streetListingIngestIsFresh(progress) || progress.listing)) {
    return json({
      ok: true,
      town,
      visionPid,
      phase: progress.phase,
      message: progress.message,
      listing: progress.listing,
    })
  }

  return json({
    ok: true,
    town,
    visionPid,
    phase: null,
    message: null,
    listing: null,
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const { town, visionPid } = readTownPid(req, body)
  if (!town || !visionPid) {
    return json({ error: 'town and visionPid are required' }, 400)
  }

  const existingProgress = await readStreetListingIngestProgress(town, visionPid)
  if (
    existingProgress &&
    STREET_LISTING_INGEST_IN_FLIGHT.has(existingProgress.phase) &&
    streetListingIngestIsFresh(existingProgress)
  ) {
    return json({
      ok: true,
      town,
      visionPid,
      phase: existingProgress.phase,
      message: existingProgress.message,
      listing: existingProgress.listing,
      started: false,
    })
  }

  const result = await ingestStreetListingIfMissing(town, visionPid)
  return json({
    ok: true,
    town,
    visionPid,
    phase: result.phase,
    message: result.message,
    listing: result.listing,
    ingested: result.ingested,
    started: true,
  })
}
