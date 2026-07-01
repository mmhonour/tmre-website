import * as rets from 'rets-client'

const listingKey = process.argv[2] ?? '288882880AE3B43DE063D501100A2250'
const mlsId = process.argv[3] ?? '24063050'

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-probe-media/0.1',
}

function extractUrls(value: unknown, out: string[] = [], depth = 0): string[] {
  if (value == null || depth > 8) return out
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && !out.includes(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) extractUrls(item, out, depth + 1)
    return out
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      extractUrls(v, out, depth + 1)
    }
  }
  return out
}

;(rets as any).getAutoLogoutClient(settings, async (client: any) => {
  console.log('--- Media metadata fields ---')
  const table = await client.metadata.getTable('Media', 'Media')
  const fields = table.results?.[0]?.metadata ?? []
  for (const f of fields) {
    console.log(`${f.SystemName?.padEnd(28)} ${(f.DataType ?? '').padEnd(10)} ${f.LongName ?? ''}`)
  }

  console.log('\n--- Search Media ---')
  const queries = [
    `(MediaResourceKey=${listingKey})`,
    `(MediaResourceId=${mlsId})`,
    `(MediaResourceKey=${mlsId})`,
    `(MediaKey=${listingKey})`,
  ]
  for (const q of queries) {
    try {
      const r = await client.search.query('Media', 'Media', q, { limit: 5, offset: 1 })
      console.log('query', q, 'count', r.results?.length ?? 0)
      if (r.results?.[0]) {
        console.log(JSON.stringify(r.results[0], null, 2))
      }
    } catch (err) {
      console.log('query failed', q, err instanceof Error ? err.message : err)
    }
  }

  console.log('\n--- getObject Media resource ---')
  for (const resource of ['Media', 'Property']) {
    for (const id of [listingKey, mlsId]) {
      for (const type of ['Photo', 'Media', 'Thumbnail', 'LargePhoto', 'HiRes']) {
        try {
          const r = await client.objects.getPreferredObjects(resource, type, id, {
            Location: 1,
            alwaysGroupObjects: true,
          })
          const urls = extractUrls(r)
          if (urls.length) {
            console.log(resource, type, id, urls[0])
          }
        } catch {
          // ignore
        }
      }
    }
  }
}).catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
