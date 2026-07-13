import * as rets from 'rets-client'

// Read-only RETS smoke test — discovers the exact MLSStatus values SmartMLS
// uses (so we can wire the UAG "Under Contract - CTS" status precisely) and
// tallies which statuses are actually in use per town. Writes NOTHING to
// Postgres/Neon, so it's safe to run against the free tier.

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe/0.1',
}

// Representative TMRE towns (Norwalk, Westport) — enough of a sample to surface
// every status currently in use, including under-contract variants.
const CITY_CODES: Array<[string, string]> = [
  ['Norwalk', '350'],
  ['Westport', '540'],
]

async function main() {
  if (!settings.loginUrl || !settings.username || !settings.password) {
    console.error('Missing RETS_SERVER_URL/USERNAME/PASSWORD. Run: npm run probe:rets')
    process.exit(1)
  }

  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    // 0) Authoritative Status lookup — the code ↔ label map we need for the DMQL
    //    query (MLSStatus=|<Value>) and the isUnderContractListing predicate.
    const underContractValues: string[] = []
    try {
      const lt = await client.metadata.getLookupTypes('Property', 'Status')
      const vals = (lt.results?.[0]?.metadata ?? []) as Array<
        Record<string, string>
      >
      console.log('\nStatus lookup (Value | ShortValue | LongValue):')
      for (const v of vals) {
        const value = v.Value ?? ''
        const shortV = v.ShortValue ?? ''
        const longV = v.LongValue ?? ''
        console.log(`  ${value.padEnd(10)} | ${shortV.padEnd(20)} | ${longV}`)
        const hay = `${shortV} ${longV}`.toLowerCase()
        if (hay.includes('under contract') || hay.includes('cts')) {
          if (value) underContractValues.push(value)
        }
      }
      console.log(
        `\nDetected under-contract Value code(s): ${underContractValues.join(', ') || '(none matched — inspect the list above)'}`,
      )
    } catch (err) {
      console.warn(
        'Status lookup metadata unavailable:',
        err instanceof Error ? err.message : err,
      )
    }

    // 1) Confirm live under-contract rows exist per town for each detected code,
    //    with a count + sample listing.
    if (underContractValues.length > 0) {
      for (const [cityName, code] of CITY_CODES) {
        for (const statusValue of underContractValues) {
          try {
            const r = await client.search.query(
              'Property',
              'Property',
              `(City=|${code}),(MLSStatus=|${statusValue})`,
              { limit: 50, offset: 1 },
            )
            const rows = (r.results ?? []) as Record<string, string>[]
            const sample = rows[0]
            console.log(
              `\n${cityName} · MLSStatus=|${statusValue} — ${r.count ?? rows.length} rows` +
                (sample
                  ? `  e.g. ${sample.ListingId} · ${sample.MLSStatus} · ${sample.StreetNumber ?? ''} ${sample.StreetName ?? ''} ${sample.StreetType ?? ''}`.trim()
                  : '  (no rows)'),
            )
          } catch (err) {
            console.warn(
              `${cityName} · MLSStatus=|${statusValue} query failed:`,
              err instanceof Error ? err.message : err,
            )
          }
        }
      }
    }

    // 2) Distinct MLSStatus values in use per town among ACTIVE-side rows (not the
    //    closed backlog), so under-contract-CTS surfaces. Uses a recent modified
    //    window to avoid the 500-row closed cap.
    for (const [cityName, code] of CITY_CODES) {
      const r = await client.search.query(
        'Property',
        'Property',
        `(City=|${code}),(ModificationTimestamp=2025-01-01+)`,
        { limit: 500, offset: 1 },
      )
      const rows = (r.results ?? []) as Record<string, string>[]
      const counts = new Map<string, number>()
      const samples = new Map<string, string>()
      for (const row of rows) {
        const s = row.MLSStatus || '(empty)'
        counts.set(s, (counts.get(s) ?? 0) + 1)
        if (!samples.has(s)) {
          samples.set(
            s,
            `${row.ListingId} · ${row.StreetNumber ?? ''} ${row.StreetName ?? ''} ${row.StreetType ?? ''}`.trim(),
          )
        }
      }
      console.log(`\n${cityName} (${code}) — ${rows.length} recently-modified rows. Statuses:`)
      for (const [s, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${s.padEnd(28)}  e.g. ${samples.get(s)}`)
      }
    }
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
