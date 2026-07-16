/** Supplement: Property change/history field scan + PriceChangeTimestamp samples */
import * as rets from 'rets-client'

const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env

if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
  console.error(
    'Missing RETS_SERVER_URL, RETS_USERNAME, or RETS_PASSWORD. ' +
      'Run with: node --env-file=.env.local --import tsx scripts/discover-rets-history-supplement.ts',
  )
  process.exit(1)
}

const settings = {
  loginUrl: RETS_SERVER_URL,
  username: RETS_USERNAME,
  password: RETS_PASSWORD,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-history-field-scan/0.1',
}

rets.getAutoLogoutClient(settings as never, async (client) => {
  const table = await client.metadata.getTable('Property', 'Property')
  const fields = (table.results?.[0]?.metadata ?? []) as Array<
    Record<string, string>
  >
  const patterns = [/change/i, /history/i, /prior/i, /previous/i, /^prev/i]
  const hits = fields.filter((f) =>
    patterns.some(
      (p) => p.test(f.SystemName ?? '') || p.test(f.LongName ?? ''),
    ),
  )
  console.log(
    `\nProperty fields matching change/history/prior (${hits.length}):`,
  )
  for (const f of hits) {
    console.log(
      `  ${(f.SystemName ?? '').padEnd(34)} ${(f.DataType ?? '').padEnd(10)} ${f.LongName ?? ''}`,
    )
  }

  const r = await client.search.query(
    'Property',
    'Property',
    '(PriceChangeTimestamp=2024-01-01+)',
    { limit: 3, offset: 1 },
  )
  const rows = (r.results ?? []) as Record<string, string>[]
  console.log(`\nSample rows with PriceChangeTimestamp set: ${rows.length}`)
  for (const row of rows) {
    console.log(`\nListingId: ${row.ListingId} | Status: ${row.MLSStatus}`)
    for (const k of [
      'ModificationTimestamp',
      'PriceChangeTimestamp',
      'StatusChangeTimestamp',
      'OriginalListPrice',
      'ListPrice',
      'CurrentPrice',
      'Price',
      'ClosePrice',
      'CloseDate',
      'ListingContractDate',
    ]) {
      if (row[k]) console.log(`  ${k}: ${row[k]}`)
    }
  }
}).catch((err: unknown) => {
  console.error('RETS session failed:')
  console.error(err)
  process.exit(1)
})
