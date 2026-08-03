import { NextResponse } from 'next/server'
import {
  cloneIntelligenceDescriptorSizes,
  getIntelligenceDescriptorSizesFresh,
} from '@/lib/intelligence-descriptor-sizes-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public read — Intelligence applies admin-tuned idle descriptor sizes. */
export async function GET() {
  const config = await getIntelligenceDescriptorSizesFresh()
  return NextResponse.json({
    config: cloneIntelligenceDescriptorSizes(config),
  })
}
