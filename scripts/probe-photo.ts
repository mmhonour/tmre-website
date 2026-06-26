import * as rets from 'rets-client'

const id = process.argv[2]
if (!id) {
  console.error('usage: tsx scripts/probe-photo.ts <listingKey-or-listingId>')
  process.exit(1)
}

const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env
if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
  console.error('Missing RETS env vars')
  process.exit(1)
}

const settings = {
  loginUrl: RETS_SERVER_URL,
  username: RETS_USERNAME,
  password: RETS_PASSWORD,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe-photo/0.1',
}

function describe(value: unknown, depth = 0, maxDepth = 4): unknown {
  if (value == null) return value
  if (depth > maxDepth) return '[...]'
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value
  if (Array.isArray(value)) return value.map((v) => describe(v, depth + 1, maxDepth))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = describe(v, depth + 1, maxDepth)
    }
    return out
  }
  return value
}

;(rets as any).getAutoLogoutClient(settings, async (client: any) => {
  console.log('--- getPreferredObjects (Location:1) ---')
  try {
    const r = await client.objects.getPreferredObjects('Property', 'Photo', id, {
      Location: 1,
      alwaysGroupObjects: true,
    })
    console.log(JSON.stringify(describe(r), null, 2))
  } catch (err) {
    console.error('Location:1 failed:', err)
  }

  console.log('\n--- getPreferredObjects (Location:0) ---')
  try {
    const r = await client.objects.getPreferredObjects('Property', 'Photo', id, {
      Location: 0,
      alwaysGroupObjects: true,
    })
    console.log(JSON.stringify(describe(r), null, 2))
  } catch (err) {
    console.error('Location:0 failed:', err)
  }
}).catch((err: unknown) => {
  console.error('session failed:', err)
  process.exit(1)
})
