/**
 * CLI for the Neon size + growth report.
 *
 *   npm run db:size
 *
 * Same payload as Admin → NEON → Size & growth. Needs DATABASE_URL in .env.local.
 */

import { closePool } from '../lib/db/postgres'
import { loadDbSizeReport } from '../lib/db-size-report'
import { formatSignedCount, formatUsd } from '../lib/db-size-report-shared'

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (text.length >= width) return text
  const fill = ' '.repeat(width - text.length)
  return align === 'right' ? fill + text : text + fill
}

function heading(title: string) {
  console.log(`\n${title}`)
  console.log('-'.repeat(title.length))
}

async function main() {
  const report = await loadDbSizeReport()
  console.log(`[size] database: ${report.database}`)

  heading('Size by table')
  const width = Math.max(20, ...report.tables.map((row) => row.table.length))
  console.log(
    `${pad('TABLE', width)}  ${pad('ROWS', 12, 'right')}  ${pad('TOTAL', 10, 'right')}` +
      `  ${pad('HEAP', 10, 'right')}  ${pad('TOAST', 10, 'right')}  ${pad('INDEXES', 10, 'right')}`,
  )
  for (const row of report.tables) {
    console.log(
      `${pad(row.table, width)}  ${pad(num(row.rows), 12, 'right')}  ${pad(row.totalLabel, 10, 'right')}` +
        `  ${pad(row.heapLabel, 10, 'right')}  ${pad(row.toastLabel, 10, 'right')}  ${pad(row.indexLabel, 10, 'right')}`,
    )
  }
  console.log(
    `\nDatabase total: ${report.totalLabel}  (storage at $0.35/GB-month = ${report.storageMonthlyLabel}/mo)`,
  )

  heading('MLS inventory (listings table)')
  if (!report.listings) {
    console.log('listings table is not present.')
  } else {
    const row = report.listings
    console.log(
      `Rows: ${num(row.total)}  ·  Active: ${num(row.active)}  ·  Closed: ${num(row.closed)}`,
    )
    console.log(
      `Newly listed   24h ${num(row.listed1d)}   7d ${num(row.listed7d)}   30d ${num(row.listed30d)}` +
        `   (~${num(row.listedPerDay)}/day)`,
    )
    console.log(
      `Newly closed   24h ${num(row.closed1d)}   7d ${num(row.closed7d)}   30d ${num(row.closed30d)}` +
        `   (~${num(row.closedPerDay)}/day)`,
    )
    console.log(
      'Listings upsert in place, so the table grows by unique MLS ids (mostly new\n' +
        'closings that stay on file), not by every incremental RETS pull.',
    )
  }

  heading('Listings by town (+ listed / − closed)')
  if (report.listingsByTown.length === 0) {
    console.log('No per-town listing increments.')
  } else {
    const tWidth = Math.max(14, ...report.listingsByTown.map((row) => row.town.length))
    console.log(
      `${pad('TOWN', tWidth)}  ${pad('ACTIVE', 8, 'right')}  ${pad('CLOSED', 8, 'right')}` +
        `  ${pad('+24H', 7, 'right')}  ${pad('−24H', 7, 'right')}  ${pad('NET24', 7, 'right')}` +
        `  ${pad('+7D', 7, 'right')}  ${pad('−7D', 7, 'right')}` +
        `  ${pad('+30D', 7, 'right')}  ${pad('−30D', 7, 'right')}`,
    )
    for (const row of report.listingsByTown) {
      console.log(
        `${pad(row.town, tWidth)}  ${pad(num(row.active), 8, 'right')}  ${pad(num(row.closed), 8, 'right')}` +
          `  ${pad(formatSignedCount(row.listed1d), 7, 'right')}  ${pad(formatSignedCount(-row.closed1d), 7, 'right')}` +
          `  ${pad(formatSignedCount(row.net1d), 7, 'right')}` +
          `  ${pad(formatSignedCount(row.listed7d), 7, 'right')}  ${pad(formatSignedCount(-row.closed7d), 7, 'right')}` +
          `  ${pad(formatSignedCount(row.listed30d), 7, 'right')}  ${pad(formatSignedCount(-row.closed30d), 7, 'right')}`,
      )
    }
    const rollup = report.listingsByTownRollup
    console.log(
      `${pad(`Sum · ${rollup.townsLabel} towns`, tWidth)}  ${pad(rollup.activeLabel, 8, 'right')}  ${pad(rollup.closedLabel, 8, 'right')}` +
        `  ${pad(rollup.listed1dLabel, 7, 'right')}  ${pad(rollup.closed1dLabel, 7, 'right')}  ${pad(rollup.net1dLabel, 7, 'right')}` +
        `  ${pad(rollup.listed7dLabel, 7, 'right')}  ${pad(rollup.closed7dLabel, 7, 'right')}` +
        `  ${pad(rollup.listed30dLabel, 7, 'right')}  ${pad(rollup.closed30dLabel, 7, 'right')}`,
    )
  }

  heading('Growth (rows added, by birth timestamp)')
  if (report.growth.length === 0) {
    console.log('No table exposes a creation timestamp — nothing to measure.')
  } else {
    const gWidth = Math.max(20, ...report.growth.map((row) => row.table.length))
    console.log(
      `${pad('TABLE', gWidth)}  ${pad('COLUMN', 16)}  ${pad('24H', 9, 'right')}  ${pad('7D', 9, 'right')}` +
        `  ${pad('30D', 10, 'right')}  ${pad('PER DAY', 9, 'right')}  ${pad('BYTES/DAY', 10, 'right')}`,
    )
    for (const row of report.growth) {
      console.log(
        `${pad(row.table, gWidth)}  ${pad(row.column, 16)}  ${pad(num(row.d1), 9, 'right')}  ${pad(num(row.d7), 9, 'right')}` +
          `  ${pad(num(row.d30), 10, 'right')}  ${pad(num(row.perDay), 9, 'right')}  ${pad(row.bytesPerDayLabel, 10, 'right')}`,
      )
    }
    console.log(
      `\nTotal growth: ${report.growthBytesPerDayLabel}/day · ${report.growthBytesPerMonthLabel}/month · ` +
        `${report.growthGbPerYear.toFixed(2)} GB/year (+${formatUsd(report.growthStorageAfterYearUsd)}/mo of storage after a year)`,
    )
    console.log(
      "Bytes/day is rows/day scaled by that table's current bytes-per-row, so it tracks\n" +
        'width as well as count — a wide jsonb row costs far more per row than a counter.',
    )
    if (report.sparseNotes.length > 0) {
      console.log('\nUndercounted — those rates are floors, not measurements:')
      for (const note of report.sparseNotes) console.log(`  · ${note}`)
    }
  }

  heading('What keeps the compute awake')
  if (!report.chatter) {
    console.log(
      'pg_stat_statements is not enabled, so per-query call counts are unavailable.\n' +
        'Enable it with:  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
    )
  } else {
    const { hoursAwake, canExtrapolate, rows, alwaysOn } = report.chatter
    console.log(
      `Compute has been awake ${hoursAwake.toFixed(1)}h since it last started. ` +
        `Neon suspends after 5 idle minutes,\nso any query below running more often than that is what is paying for the awake hours.`,
    )
    if (!canExtrapolate) {
      console.log(
        'Window is under an hour, so per-day rates are withheld — re-run once the\n' +
          'compute has been up a while, or after SELECT pg_stat_statements_reset().',
      )
    }
    console.log('')
    console.log(`${pad('CALLS', 12, 'right')}  ${pad('CALLS/DAY', 11, 'right')}  ${pad('EVERY', 10, 'right')}  QUERY`)
    for (const row of rows) {
      console.log(
        `${pad(num(row.calls), 12, 'right')}  ${pad(row.callsPerDay == null ? '—' : num(row.callsPerDay), 11, 'right')}  ${pad(row.everyLabel, 10, 'right')}  ${row.query}`,
      )
    }
    console.log('\nAn always-awake compute bills all 730 hours in a month:')
    for (const cost of alwaysOn) {
      console.log(
        `  ${cost.cu} CU  → ${formatUsd(cost.launchUsd)}/mo on Launch · ${formatUsd(cost.scaleUsd)}/mo on Scale`,
      )
    }
  }
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message.trim() : String(err)
    console.error('[size] FAILED:', message)
    process.exitCode = 1
  })
  .finally(() => closePool())
