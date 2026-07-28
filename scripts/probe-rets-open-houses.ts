import * as rets from 'rets-client'

/**
 * Read-only OpenHouse probe — finds which DMQL SmartMLS accepts and samples
 * OHListingKey / OHListingId for join debugging.
 *
 * Run: npm run probe:rets:open-houses
 */

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe-oh/0.1',
}

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  )
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function isNoRecords(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = String((err as { replyCode?: string }).replyCode ?? '')
  const tag = String((err as { replyTag?: string }).replyTag ?? '')
  return code === '20201' || tag === 'NO_RECORDS_FOUND'
}

async function main() {
  if (!settings.loginUrl || !settings.username || !settings.password) {
    console.error(
      'Missing RETS_SERVER_URL/USERNAME/PASSWORD. Run: npm run probe:rets:open-houses',
    )
    process.exit(1)
  }

  const start = etToday()
  const end = addDays(start, 6)
  console.log(`Window (ET): ${start} → ${end}`)

  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    try {
      const resources = await client.metadata.getResources()
      const rows = (resources.results?.[0]?.metadata ?? []) as Array<
        Record<string, string>
      >
      const oh = rows.find((r) => /openhouse/i.test(r.ResourceID ?? ''))
      console.log(
        '\nOpenHouse resource:',
        oh
          ? `${oh.ResourceID} (${oh.VisibleName ?? oh.StandardName ?? ''})`
          : '(not listed — query may still work)',
      )
    } catch (err) {
      console.warn('getResources failed:', err instanceof Error ? err.message : err)
    }

    for (const lookup of ['OpenHouseStatus', 'OHType', 'Status', 'OHActiveYN']) {
      try {
        const lt = await client.metadata.getLookupTypes('OpenHouse', lookup)
        const vals = (lt.results?.[0]?.metadata ?? []) as Array<
          Record<string, string>
        >
        console.log(`\nLookup OpenHouse/${lookup}:`)
        for (const v of vals.slice(0, 40)) {
          console.log(
            `  ${(v.Value ?? '').padEnd(12)} | ${(v.ShortValue ?? '').padEnd(20)} | ${v.LongValue ?? ''}`,
          )
        }
        if (vals.length > 40) console.log(`  … +${vals.length - 40} more`)
      } catch (err) {
        console.warn(
          `Lookup OpenHouse/${lookup} unavailable:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    const date = `(OHDate=${start}-${end})`
    // Probed SmartMLS codes: OpenHouseStatus A=Active, OHType O=Public.
    const candidates = [
      `${date},(OHActiveYN=1),(OpenHouseStatus=|A),(OHType=|O)`,
      `${date},(OHActiveYN=1),(OpenHouseStatus=|Active),(OHType=|Public)`,
      `${date},(OHActiveYN=1),(OpenHouseStatus=Active),(OHType=Public)`,
      `${date},(OHActiveYN=1)`,
      date,
    ]

    for (const dmql of candidates) {
      try {
        const r = await client.search.query('OpenHouse', 'OpenHouse', dmql, {
          limit: 25,
          offset: 1,
        })
        const rows = (r.results ?? []) as Record<string, string>[]
        console.log(`\nDMQL OK (${rows.length} sample / count=${r.count ?? '?'}):`)
        console.log(`  ${dmql}`)
        const sample = rows[0]
        if (sample) {
          console.log('  keys:', Object.keys(sample).sort().join(', '))
          console.log(
            '  sample:',
            JSON.stringify(
              {
                OHDate: sample.OHDate,
                OHActiveYN: sample.OHActiveYN,
                OpenHouseStatus: sample.OpenHouseStatus,
                OHType: sample.OHType,
                OHListingKey: sample.OHListingKey,
                OHListingId: sample.OHListingId,
                OHStartDateTime: sample.OHStartDateTime,
                OHEndDateTime: sample.OHEndDateTime,
              },
              null,
              2,
            ),
          )
        }
      } catch (err) {
        if (isNoRecords(err)) {
          console.log(`\nDMQL empty (NO_RECORDS_FOUND): ${dmql}`)
          continue
        }
        console.warn(
          `\nDMQL failed: ${dmql}\n `,
          err instanceof Error ? err.message : err,
        )
      }
    }
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
