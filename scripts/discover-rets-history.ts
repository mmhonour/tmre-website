/**
 * SmartMLS RETS discovery — find History / change-log resources and sample fields.
 * Read-only; writes nothing to Postgres.
 *
 * Run: npm run discover:rets:history
 */
import * as rets from 'rets-client'

const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env

if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
  console.error(
    'Missing RETS_SERVER_URL, RETS_USERNAME, or RETS_PASSWORD. ' +
      'Run with: npm run discover:rets:history',
  )
  process.exit(1)
}

const clientSettings = {
  loginUrl: RETS_SERVER_URL,
  username: RETS_USERNAME,
  password: RETS_PASSWORD,
  version: 'RETS/1.7.2',
  userAgent: 'tmre-website-discover-history/0.1',
}

type MetaRow = Record<string, string>

function section(title: string) {
  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log('='.repeat(72))
}

function haystack(row: MetaRow): string {
  return Object.values(row)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isHistoryLike(text: string): boolean {
  return /history|change|audit|log|event|modification|price.?change|status.?change/.test(
    text,
  )
}

const HISTORY_FIELD_HINTS =
  /modif|change|price|amount|type|status|date|time|list|prior|previous|old|new|field|event|history/i

rets.getAutoLogoutClient(clientSettings as never, async (client) => {
  section('RESOURCES (history-related highlighted)')
  const resources = await client.metadata.getResources()
  const resourceRows = (resources.results?.[0]?.metadata ?? []) as MetaRow[]

  const historyResources: MetaRow[] = []
  for (const r of resourceRows) {
    const id = r.ResourceID ?? ''
    const label = `${r.VisibleName ?? ''} ${r.StandardName ?? ''} ${r.Description ?? ''}`
    const hit = isHistoryLike(`${id} ${label}`)
    console.log(`${hit ? '>>>' : '   '} ${id.padEnd(20)} ${label.trim()}`)
    if (hit) historyResources.push(r)
  }

  section('CLASSES — all resources (history-related highlighted)')
  const historyClasses: Array<{ resourceId: string; className: string; meta: MetaRow }> =
    []

  for (const r of resourceRows) {
    const resourceId = r.ResourceID
    if (!resourceId) continue

    const classes = await client.metadata.getClass(resourceId)
    const classRows = (classes.results?.[0]?.metadata ?? []) as MetaRow[]
    if (classRows.length === 0) continue

    console.log(`\n--- ${resourceId} ---`)
    for (const c of classRows) {
      const className = c.ClassName ?? ''
      const label = `${c.VisibleName ?? ''} ${c.StandardName ?? ''} ${c.Description ?? ''}`
      const hit = isHistoryLike(`${className} ${label}`) || isHistoryLike(resourceId)
      console.log(`  ${hit ? '>>>' : '   '} ${className.padEnd(24)} ${label.trim()}`)
      if (hit && className) {
        historyClasses.push({ resourceId, className, meta: c })
      }
    }
  }

  // Always inspect Property fields for inline history / change columns
  section('PROPERTY FIELDS — change / history / price hints')
  try {
    const propertyClasses = await client.metadata.getClass('Property')
    const classRows = (propertyClasses.results?.[0]?.metadata ?? []) as MetaRow[]
    const propertyClass = classRows[0]?.ClassName ?? 'Property'
    const table = await client.metadata.getTable('Property', propertyClass)
    const fields = (table.results?.[0]?.metadata ?? []) as MetaRow[]
    const hits = fields.filter((f) => HISTORY_FIELD_HINTS.test(haystack(f)))
    console.log(`Property / ${propertyClass} — ${hits.length} matching fields:`)
    for (const f of hits) {
      console.log(
        `  ${(f.SystemName ?? '').padEnd(32)} ${(f.DataType ?? '').padEnd(10)} ${f.LongName ?? ''}`,
      )
    }
  } catch (err) {
    console.error('Property field scan failed:', err)
  }

  section('HISTORY-LIKE CLASSES — field metadata')
  const seen = new Set<string>()
  for (const { resourceId, className } of historyClasses) {
    const key = `${resourceId}/${className}`
    if (seen.has(key)) continue
    seen.add(key)

    console.log(`\n--- ${resourceId} / ${className} ---`)
    try {
      const table = await client.metadata.getTable(resourceId, className)
      const fields = (table.results?.[0]?.metadata ?? []) as MetaRow[]
      for (const f of fields) {
        console.log(
          `  ${(f.SystemName ?? '').padEnd(32)} ${(f.DataType ?? '').padEnd(10)} ${f.LongName ?? ''}`,
        )
      }
    } catch (err) {
      console.error(`  metadata failed:`, err instanceof Error ? err.message : err)
    }
  }

  section('SAMPLE QUERIES — history-like classes')
  for (const { resourceId, className } of historyClasses) {
    const key = `${resourceId}/${className}`
    console.log(`\n--- ${key} ---`)

    let dateField = 'ModificationTimestamp'
    try {
      const table = await client.metadata.getTable(resourceId, className)
      const fields = (table.results?.[0]?.metadata ?? []) as MetaRow[]
      dateField =
        fields.find((f) => f.DataType === 'DateTime' && f.SystemName)?.SystemName ??
        fields.find((f) => /date|time|modif/i.test(f.SystemName ?? ''))?.SystemName ??
        'ModificationTimestamp'
    } catch {
      /* use default */
    }

    const dmql = `(${dateField}=1900-01-01+)`
    console.log(`DMQL: ${dmql}`)

    try {
      const result = await client.search.query(resourceId, className, dmql, {
        limit: 3,
        offset: 1,
      })
      const rows = (result.results ?? []) as Record<string, string>[]
      console.log(`Count (reported): ${result.count ?? rows.length}`)
      if (rows.length === 0) {
        console.log('  (no rows)')
        continue
      }
      console.log('Field names on sample row:')
      console.log(`  ${Object.keys(rows[0]).sort().join(', ')}`)
      for (let i = 0; i < rows.length; i++) {
        console.log(`\nSample row ${i + 1}:`)
        const prioritized = Object.entries(rows[i]).filter(([k]) =>
          HISTORY_FIELD_HINTS.test(k),
        )
        const rest = Object.entries(rows[i]).filter(
          ([k]) => !HISTORY_FIELD_HINTS.test(k),
        )
        for (const [k, v] of [...prioritized, ...rest.slice(0, 15)]) {
          if (v != null && String(v).trim() !== '') {
            console.log(`  ${k}: ${v}`)
          }
        }
      }
    } catch (err) {
      console.error(`  query failed:`, err instanceof Error ? err.message : err)
    }
  }

  // Sample Property row for inline change fields
  section('SAMPLE Property row — inline change / timestamp fields')
  try {
    const propertyClasses = await client.metadata.getClass('Property')
    const classRows = (propertyClasses.results?.[0]?.metadata ?? []) as MetaRow[]
    const propertyClass = classRows[0]?.ClassName ?? 'Property'
    const result = await client.search.query(
      'Property',
      propertyClass,
      '(ModificationTimestamp=2025-01-01+)',
      { limit: 1, offset: 1 },
    )
    const row = (result.results?.[0] ?? {}) as Record<string, string>
    const keys = Object.keys(row).filter((k) => HISTORY_FIELD_HINTS.test(k)).sort()
    console.log(`Matching keys on a recent Property row (${keys.length}):`)
    for (const k of keys) {
      console.log(`  ${k}: ${row[k]}`)
    }
  } catch (err) {
    console.error('Property sample failed:', err)
  }
}).catch((err: unknown) => {
  console.error('RETS session failed:')
  console.error(err)
  process.exit(1)
})
