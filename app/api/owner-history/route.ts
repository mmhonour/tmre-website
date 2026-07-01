import { NextResponse } from 'next/server'
import { fetchTownRecentSales, type VisionSale } from '@/lib/vision-appraisal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type Sale = VisionSale

export type OwnerGroup = {
  owner: string
  properties: { address: string; saleDate: string; salePrice: string }[]
}

function groupByOwner(sales: Sale[]): OwnerGroup[] {
  const map = new Map<string, OwnerGroup>()
  for (const s of sales) {
    const key = s.owner.toUpperCase()
    if (!map.has(key)) {
      map.set(key, { owner: s.owner, properties: [] })
    }
    map.get(key)!.properties.push({
      address: s.address,
      saleDate: s.saleDate,
      salePrice: s.salePrice,
    })
  }
  return [...map.values()]
    .sort((a, b) => a.owner.localeCompare(b.owner))
    .map((g) => ({
      ...g,
      properties: g.properties.sort(
        (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime(),
      ),
    }))
}

export async function GET() {
  try {
    const sales = await fetchTownRecentSales('Westport')
    const owners = groupByOwner(sales)
    return NextResponse.json({
      owners,
      fetchedAt: new Date().toISOString(),
      source: 'vision-appraisal',
    })
  } catch (err) {
    console.error('[owner-history] fetch failed', err)
    return NextResponse.json({ owners: [], error: String(err) }, { status: 502 })
  }
}
