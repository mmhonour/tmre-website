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
const WIDTH = 460
const HEIGHT = 140
const ROW_HEIGHT = 24

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()

  let rows: { label: string; value: string }[] = []
  try {
    const { listing } = await readListingFromDbByMlsId(id)
    const contact = listing ? extractListingAgentContact(listing.raw) : null
    rows = (
      [
        { label: 'List agent', value: contact?.listAgentName },
        { label: 'Phone', value: contact?.phone },
        { label: 'Email', value: contact?.email },
        { label: 'Agent MLS #', value: contact?.agentMlsId },
        { label: 'List office', value: contact?.listOfficeName },
      ] as { label: string; value: string | null | undefined }[]
    ).flatMap((row) =>
      row.value ? [{ label: row.label, value: row.value }] : [],
    )
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
          flexDirection: 'column',
          justifyContent: 'flex-start',
          background: 'transparent',
          fontSize: 13,
        }}
      >
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              height: ROW_HEIGHT,
              width: '100%',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{row.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.88)' }}>{row.value}</span>
          </div>
        ))}
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
