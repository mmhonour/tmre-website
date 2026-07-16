import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  getGoldilocksConfigFresh,
  isDefaultGoldilocksConfig,
  setGoldilocksConfig,
} from '@/lib/goldilocks-config'
import {
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_HINTS,
  GOLDILOCKS_KEYWORD_GROUP_LABELS,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  goldilocksWeightSum,
} from '@/lib/goldilocks-config-shared'
import { FACTOR_DESCRIPTIONS, FACTOR_LABELS } from '@/lib/goldilocks-score-info'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const config = await getGoldilocksConfigFresh()
  return {
    config,
    default: DEFAULT_GOLDILOCKS_SCORING_CONFIG,
    isDefault: isDefaultGoldilocksConfig(config),
    weightSum: goldilocksWeightSum(config.weights),
    meta: {
      factors: GOLDILOCKS_FACTOR_ORDER.map((key) => ({
        key,
        label: FACTOR_LABELS[key],
        description: FACTOR_DESCRIPTIONS[key],
      })),
      keywordGroups: GOLDILOCKS_KEYWORD_GROUP_ORDER.map((id) => ({
        id,
        label: GOLDILOCKS_KEYWORD_GROUP_LABELS[id],
        hint: GOLDILOCKS_KEYWORD_GROUP_HINTS[id],
      })),
    },
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const applied = await setGoldilocksConfig(
      (body as { config?: unknown })?.config ?? body,
    )
    return NextResponse.json({
      ok: true,
      ...(await payload()),
      config: applied,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
