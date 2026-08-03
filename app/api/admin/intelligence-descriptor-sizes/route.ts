import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  cloneIntelligenceDescriptorSizes,
  DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
  getIntelligenceDescriptorSizesFresh,
  isDefaultIntelligenceDescriptorSizes,
  setIntelligenceDescriptorSizes,
} from '@/lib/intelligence-descriptor-sizes-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const config = await getIntelligenceDescriptorSizesFresh()
  return NextResponse.json({
    config,
    default: cloneIntelligenceDescriptorSizes(
      DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
    ),
    isDefault: isDefaultIntelligenceDescriptorSizes(config),
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { config?: unknown } = {}
  try {
    body = (await req.json()) as { config?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const config = await setIntelligenceDescriptorSizes(body.config)
    return NextResponse.json({
      config,
      default: cloneIntelligenceDescriptorSizes(
        DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
      ),
      isDefault: isDefaultIntelligenceDescriptorSizes(config),
      note: 'Saved. Intelligence picks this up on the next page load.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
