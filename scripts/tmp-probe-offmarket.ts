/**
 * Probe what our SmartMLS RETS view can actually see for off-market statuses.
 * Answers: can we query Withdrawn / Expired / Temp-off-market at all, and can we
 * still retrieve a listing by MLS number once it leaves the Active family?
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/tmp-probe-offmarket.ts
 *
 * Read-only.
 */
import * as rets from 'rets-client'

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe/0.1',
}

const PROBES: Array<[string, string]> = [
  ['Active in Norwalk (sanity)', '(MLSStatus=|A),(City=|350)'],
  ['Withdrawn in Norwalk', '(MLSStatus=|W),(City=|350)'],
  ['Expired in Norwalk', '(MLSStatus=|X),(City=|350)'],
  ['Pending in Norwalk', '(MLSStatus=|P),(City=|350)'],
  ['Temp off market in Norwalk', '(MLSStatus=|T),(City=|350)'],
  ['Hold in Norwalk', '(MLSStatus=|H),(City=|350)'],
  [
    'Any status changed since 2026-08-01 in Norwalk',
    '(City=|350),(StatusChangeTimestamp=2026-08-01-2026-08-21)',
  ],
  [
    'Any modified since 2026-08-14 in Norwalk',
    '(City=|350),(ModificationTimestamp=2026-08-14T00:00:00+)',
  ],
  ['By ListingId 24200094 (control — currently Active in MLS)', '(ListingId=24200094)'],
  ['By ListingId 24161363 (the reported listing)', '(ListingId=24161363)'],
  ['By ListingId 24169777 (vanished from our Active set)', '(ListingId=24169777)'],
  ['Address text via UnparsedAddress (what buildDmql sends)', '(UnparsedAddress=*Nearwater*)'],
  ['Address text via StreetName exact', '(City=|350),(StreetName=Nearwater)'],
  ['Address text via StreetName wildcard', '(City=|350),(StreetName=Nearwater*)'],
]

async function main() {
  if (!settings.loginUrl || !settings.username || !settings.password) {
    throw new Error('Missing RETS_SERVER_URL / RETS_USERNAME / RETS_PASSWORD')
  }

  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    for (const [label, dmql] of PROBES) {
      try {
        const result = await client.search.query('Property', 'Property', dmql, {
          limit: 25,
          offset: 1,
        })
        const rows = (result?.results ?? []) as Array<Record<string, unknown>>
        const byStatus = new Map<string, number>()
        for (const row of rows) {
          const key = String(row.MLSStatus ?? row.StandardStatus ?? '?')
          byStatus.set(key, (byStatus.get(key) ?? 0) + 1)
        }
        const detail = [...byStatus]
          .map(([status, count]) => `${status}×${count}`)
          .join(' ')
        console.log(`OK   ${label}\n       ${dmql}\n       rows=${rows.length} ${detail}`)
        if (rows.length > 0 && rows.length <= 3) {
          for (const row of rows) {
            console.log(
              `       → ${row.ListingId} ${row.MLSStatus} ${row.UnparsedAddress ?? ''} statusChg=${row.StatusChangeTimestamp ?? '—'} mod=${row.ModificationTimestamp ?? '—'}`,
            )
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`FAIL ${label}\n       ${dmql}\n       ${msg}`)
      }
    }
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
