import 'server-only'

import { fetchListingByMlsId } from '@/lib/listings-store'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/listings-db'
import { fetchPhotoBuffers } from '@/lib/rets'
import type { FinishQualityAssessment, FinishQualityTier } from '@/lib/finish-quality-types'

export type { FinishQualityAssessment, FinishQualityTier } from '@/lib/finish-quality-types'

export const FINISH_QUALITY_CACHE_PREFIX = 'finish-quality:v1'
export const FINISH_QUALITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const VALID_TIERS = new Set<FinishQualityTier>([
  'Premium',
  'Updated',
  'Dated',
  'Builder-grade',
])

function cacheKey(mlsId: string): string {
  return `${FINISH_QUALITY_CACHE_PREFIX}:${mlsId.trim()}`
}

function readCached(mlsId: string): FinishQualityAssessment | null {
  const row = readStatsCacheRow(cacheKey(mlsId))
  if (!row) return null
  const age = Date.now() - Date.parse(row.computedAt)
  if (Number.isNaN(age) || age > FINISH_QUALITY_CACHE_TTL_MS) return null
  try {
    const parsed = JSON.parse(row.payload) as FinishQualityAssessment
    return parsed?.assessedAt ? parsed : null
  } catch {
    return null
  }
}

function writeCached(mlsId: string, assessment: FinishQualityAssessment): void {
  writeStatsCacheRow(cacheKey(mlsId), assessment)
}

function unavailable(note = 'Photo assessment unavailable'): FinishQualityAssessment {
  return {
    tier: null,
    note,
    assessedAt: new Date().toISOString(),
    source: 'unavailable',
  }
}

function parseAssessment(raw: string): FinishQualityAssessment | null {
  try {
    const parsed = JSON.parse(raw) as { tier?: string; note?: string }
    const tier = parsed.tier?.trim() as FinishQualityTier | undefined
    const note = parsed.note?.trim()
    if (!tier || !VALID_TIERS.has(tier) || !note) return null
    return {
      tier,
      note: note.slice(0, 120),
      assessedAt: new Date().toISOString(),
      source: 'ai',
    }
  } catch {
    return null
  }
}

async function assessWithOpenAI(photoBuffers: Buffer[]): Promise<FinishQualityAssessment | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'
  const imageParts = photoBuffers.slice(0, 5).map((buf) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/jpeg;base64,${buf.toString('base64')}`,
      detail: 'low' as const,
    },
  }))

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'You assess interior finish quality for Connecticut residential listings from MLS photos.',
                'Choose exactly one tier: Premium, Updated, Dated, or Builder-grade.',
                'Premium = high-end materials, designer-level kitchens/baths.',
                'Updated = recent renovations, modern but not luxury.',
                'Dated = original or worn finishes, needs refresh.',
                'Builder-grade = basic new-build or tract-home finishes.',
                'Return JSON only: {"tier":"...","note":"8-15 word summary of visible finishes"}',
                'If mostly exterior photos, infer cautiously from any interior glimpses.',
              ].join(' '),
            },
            ...imageParts,
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    console.error('[finish-quality] OpenAI error', res.status, await res.text().catch(() => ''))
    return null
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) return null
  return parseAssessment(content)
}

export async function getFinishQuality(mlsId: string): Promise<FinishQualityAssessment> {
  const id = mlsId.trim()
  if (!id) return unavailable('Missing listing id')

  const cached = readCached(id)
  if (cached) return { ...cached, source: 'cached' }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return unavailable()
  }

  try {
    const { listing } = await fetchListingByMlsId(id)
    if (!listing) return unavailable('Listing not found')

    const photoKey = listing.listingKey || listing.mlsId
    const buffers = await fetchPhotoBuffers(
      photoKey,
      listing.mlsId,
      5,
      listing.photoCount,
    )

    if (!buffers.length) {
      const result = unavailable('No listing photos to assess')
      writeCached(id, result)
      return result
    }

    const assessed = await assessWithOpenAI(buffers)
    if (!assessed) {
      return unavailable('Could not assess finishes from photos')
    }

    const result: FinishQualityAssessment = {
      ...assessed,
      photoCount: buffers.length,
    }
    writeCached(id, result)
    return result
  } catch (err) {
    console.error('[finish-quality] assessment failed', err)
    return unavailable('Could not assess finishes from photos')
  }
}
