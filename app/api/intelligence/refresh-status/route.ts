import { NextResponse } from 'next/server'
import { readSqliteRefreshStatus } from '@/lib/sqlite-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const status = readSqliteRefreshStatus()
  return NextResponse.json(status, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
