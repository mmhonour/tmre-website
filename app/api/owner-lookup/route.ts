import { NextRequest, NextResponse } from 'next/server'
import {
  fetchOwnerFromVision,
  parseStreet,
  visionTownCode,
} from '@/lib/vision-appraisal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim().toLowerCase()
  const street = (searchParams.get('street') ?? '').trim()

  if (!city || !street) {
    return NextResponse.json({ owner: null, error: 'city and street required' }, { status: 400 })
  }

  const townCode = visionTownCode(city)
  if (!townCode) {
    return NextResponse.json({ owner: null, error: `No Vision Appraisal mapping for '${city}'` })
  }

  const parsed = parseStreet(street)
  if (!parsed) {
    return NextResponse.json({ owner: null, error: 'Could not parse street address' })
  }

  try {
    const owner = await fetchOwnerFromVision(townCode, parsed.streetNo, parsed.streetName)
    return NextResponse.json({ owner, source: 'vision-appraisal' })
  } catch (err) {
    console.error('[owner-lookup] Vision Appraisal fetch failed', err)
    return NextResponse.json({ owner: null, error: 'Vision Appraisal lookup failed' })
  }
}
