import * as rets from 'rets-client'

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe/0.1',
}

async function main() {
  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    // 1) Pull all statuses currently in use (Norwalk + Westport)
    for (const code of ['350', '540']) {
      const r = await client.search.query(
        'Property',
        'Property',
        `(City=|${code})`,
        { limit: 500, offset: 1 },
      )
      const rows = (r.results ?? []) as Record<string, string>[]
      const cityName = rows[0]?.City || 'city ' + code
      const counts = new Map<string, number>()
      for (const row of rows) {
        const s = row.MLSStatus || '(empty)'
        counts.set(s, (counts.get(s) ?? 0) + 1)
      }
      console.log(`\n${cityName} (${code}) — ${rows.length} rows. Statuses:`)
      for (const [s, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${s}`)
      }
    }

    // 2) Look at an "Active" Norwalk record to see real ListPrices and PropertyTypes
    const a = await client.search.query(
      'Property',
      'Property',
      '(City=|350),(MLSStatus=|A)',
      { limit: 10, offset: 1 },
    )
    const arows = (a.results ?? []) as Record<string, string>[]
    console.log(`\nActive Norwalk sample (${arows.length}):`)
    for (const r of arows) {
      console.log(
        `  ${r.ListingId} | ${r.PropertyType} | $${r.ListPrice} | ${r.BedsTotal}bd/${r.BathsTotal}ba | ${r.StreetNumber} ${r.StreetName} ${r.StreetType}`,
      )
    }
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
