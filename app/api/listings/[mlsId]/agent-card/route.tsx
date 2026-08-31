import { ImageResponse } from 'next/og'
import { extractListingAgentContact } from '@/lib/listing-agent-contact'
import { readListingFromDbByMlsId } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Listing agent attribution as a PNG.
 *
 * Rendered server-side rather than drawn on a canvas so the text never has to
 * reach the browser. That is what makes it possible to later drop these fields
 * from `/api/listings/[mlsId]` without breaking the display — the image reads
 * straight from Postgres.
 *
 * Fixed canvas: the row count varies by listing, and a fixed size lets callers
 * set width/height up front instead of reflowing once the image decodes.
 */
// Drawn at 2x and displayed at half width, so the small type stays crisp on
// retina rather than looking like a resized screenshot.
const SCALE = 2
const WIDTH = 560 * SCALE
const HEIGHT = 26 * SCALE
const FONT_SIZE = 11 * SCALE

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()

  let detail = ''
  try {
    const { listing } = await readListingFromDbByMlsId(id)
    const contact = listing ? extractListingAgentContact(listing.raw) : null
    // One label, then every field space-separated on a single line.
    detail = [
      contact?.listAgentName,
      contact?.phone,
      contact?.email,
      contact?.agentMlsId,
      contact?.listOfficeName,
    ]
      .filter(Boolean)
      .join(' ')
  } catch (err) {
    console.error('[/api/listings/[mlsId]/agent-card] failed', err)
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          alignItems: 'baseline',
          gap: 6 * SCALE,
          background: 'transparent',
          fontSize: FONT_SIZE,
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>List agent</span>
        <span style={{ color: 'rgba(255,255,255,0.88)' }}>{detail}</span>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Attribution changes only when the listing does.
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  )
}
