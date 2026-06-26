import * as rets from 'rets-client'

const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env

if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
  console.error(
    'Missing RETS_SERVER_URL, RETS_USERNAME, or RETS_PASSWORD. ' +
      'Run with: npm run discover:rets',
  )
  process.exit(1)
}

const clientSettings = {
  loginUrl: RETS_SERVER_URL,
  username: RETS_USERNAME,
  password: RETS_PASSWORD,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-website-discover/0.1',
}

function section(title: string) {
  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log('='.repeat(72))
}

rets.getAutoLogoutClient(clientSettings as never, async (client) => {
  section('SYSTEM')
  console.log(JSON.stringify(client.systemData, null, 2))

  section('RESOURCES')
  const resources = await client.metadata.getResources()
  const resourceRows = resources.results?.[0]?.metadata ?? []
  for (const r of resourceRows) {
    console.log(`- ${r.ResourceID}  (${r.VisibleName ?? r.StandardName ?? ''})`)
  }

  for (const r of resourceRows) {
    const resourceId = r.ResourceID
    if (!resourceId) continue

    section(`CLASSES — ${resourceId}`)
    const classes = await client.metadata.getClass(resourceId)
    const classRows = classes.results?.[0]?.metadata ?? []
    for (const c of classRows) {
      console.log(`- ${c.ClassName}  (${c.VisibleName ?? c.StandardName ?? ''})`)
    }

    if (resourceId !== 'Property') continue

    const firstClass = classRows[0]?.ClassName
    if (!firstClass) continue

    section(`FIELDS — Property / ${firstClass}`)
    const table = await client.metadata.getTable(resourceId, firstClass)
    const fields = table.results?.[0]?.metadata ?? []
    for (const f of fields as Array<Record<string, string>>) {
      console.log(
        `${f.SystemName?.padEnd(28) ?? ''} ${(f.DataType ?? '').padEnd(10)} ${f.LongName ?? ''}`,
      )
    }

    section(`SAMPLE QUERY — Property / ${firstClass} (limit 1)`)
    const dateField =
      (fields as Array<Record<string, string>>).find(
        (f) => f.DataType === 'DateTime' && f.SystemName,
      )?.SystemName ?? 'ModificationTimestamp'
    const dmql = `(${dateField}=1900-01-01+)`
    console.log(`DMQL: ${dmql}`)

    try {
      const result = await client.search.query(resourceId, firstClass, dmql, {
        limit: 1,
        offset: 1,
      })
      const row = result.results?.[0]
      if (row) {
        console.log('\nField names returned on a row:')
        console.log(Object.keys(row).sort().join(', '))
        console.log('\nFirst record (raw):')
        console.log(JSON.stringify(row, null, 2))
      } else {
        console.log('No rows returned.')
      }
    } catch (err) {
      console.error('Sample query failed — try editing the DMQL above.')
      console.error(err)
    }
  }
}).catch((err: unknown) => {
  console.error('RETS session failed:')
  console.error(err)
  process.exit(1)
})
