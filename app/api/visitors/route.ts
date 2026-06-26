import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VISITORS_FILE = path.join(process.cwd(), 'data', 'visitors.json')

export async function GET() {
  try {
    const raw = await fs.readFile(VISITORS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const visitors = Object.values(parsed).sort((a, b) => {
      const ta = Date.parse((a as { lastSeen?: string }).lastSeen ?? '')
      const tb = Date.parse((b as { lastSeen?: string }).lastSeen ?? '')
      return tb - ta
    })
    const identified = visitors.filter((v) => (v as { email?: string | null }).email).length
    return NextResponse.json({
      count: visitors.length,
      identifiedCount: identified,
      visitors,
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ count: 0, identifiedCount: 0, visitors: [] })
    }
    console.error('[/api/visitors] read failed', err)
    return NextResponse.json({ error: 'Failed to read visitors' }, { status: 500 })
  }
}
