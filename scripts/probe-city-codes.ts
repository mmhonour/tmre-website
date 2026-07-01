import * as rets from 'rets-client'

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe/0.1',
}

async function probeCode(client: any, code: string) {
  try {
    const r = await client.search.query(
      'Property',
      'Property',
      `(City=|${code}),(MLSStatus=|A)`,
      { limit: 1, offset: 1 },
    )
    const rows = (r.results ?? []) as Record<string, string>[]
    if (!rows.length) return null
    return { city: rows[0].City, zip: rows[0].PostalCode }
  } catch {
    return null
  }
}

async function main() {
  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    const targets = ['Wilton', 'New Canaan']
    for (let code = 300; code <= 560; code++) {
      const hit = await probeCode(client, String(code))
      if (!hit) continue
      if (targets.some((t) => hit.city === t)) {
        console.log(`Code ${code}: ${hit.city} zip=${hit.zip}`)
      }
    }
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
