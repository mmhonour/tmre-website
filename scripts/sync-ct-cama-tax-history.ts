#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { syncCtCamaTaxHistory, type CamaTaxSyncResult } from '../lib/ct-cama-tax-sync'
import type { ListingParcelCandidate } from '../lib/ct-cama-tax-compute'
import { TMRE_TOWNS } from '../lib/tmre-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const LOG = '[cama-tax]'

/**
 * Backfill four historical fiscal years of property tax into
 * `listing_tax_history` from the CT Parcel & CAMA extracts.
 *
 *   npm run sync:cama-tax -- --dry-run --town Westport --limit 25
 *   npm run sync:cama-tax -- --sample
 *   npm run sync:cama-tax
 *
 * `--sample` needs no database: it drives the pipeline with the checked-in VGSI
 * Westport parcel sample standing in for listings, which is enough to prove the
 * fetch, the parcel match and the arithmetic against live state data.
 */
type Args = {
  towns: string[]
  dryRun: boolean
  sample: boolean
  limit: number | null
  years: number
  anchor: number | null
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const towns: string[] = []
  let dryRun = false
  let sample = false
  let limit: number | null = null
  let years = 4
  let anchor: number | null = null
  let json = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    const next = () => argv[++i]
    switch (arg) {
      case '--dry-run':
        dryRun = true
        break
      case '--sample':
        sample = true
        dryRun = true
        break
      case '--json':
        json = true
        break
      case '--town': {
        const value = next()
        if (value) towns.push(value)
        break
      }
      case '--limit': {
        const value = Number(next())
        if (Number.isFinite(value) && value > 0) limit = Math.floor(value)
        break
      }
      case '--years': {
        const value = Number(next())
        if (Number.isFinite(value) && value > 0) years = Math.floor(value)
        break
      }
      case '--anchor-fy': {
        const value = Number(next())
        if (Number.isFinite(value)) anchor = Math.floor(value)
        break
      }
      default:
        if (arg.startsWith('--')) {
          throw new Error(`${LOG} unknown flag ${arg}`)
        }
    }
  }

  for (const town of towns) {
    if (!(TMRE_TOWNS as readonly string[]).includes(town)) {
      throw new Error(
        `${LOG} ${town} is not a coverage town (${TMRE_TOWNS.join(', ')})`,
      )
    }
  }

  return { towns, dryRun, sample, limit, years, anchor, json }
}

type VisionSampleRow = {
  address_full?: string
  street_no?: string
  street_name?: string
  vision_pid?: string
  assessed_value?: number
}

/**
 * Stand-in listings built from the checked-in VGSI sample.
 *
 * The parcel number is faked from the Vision pid because the sample has no MLS
 * row behind it; that only affects the write key, which a dry run never uses.
 */
function sampleListings(town: string): ListingParcelCandidate[] {
  const file = path.join(
    process.cwd(),
    'scripts',
    'out',
    'vision-addresses-westport-sample.json',
  )
  if (town !== 'Westport' || !existsSync(file)) return []

  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const rows: VisionSampleRow[] = Array.isArray(parsed)
    ? (parsed as VisionSampleRow[])
    : ((parsed as { rows?: VisionSampleRow[] })?.rows ?? [])

  return rows.flatMap((row) => {
    const street = [row.street_no, row.street_name].filter(Boolean).join(' ').trim()
    const pid = row.vision_pid?.trim()
    if (!street || !pid) return []
    return [
      {
        listingId: `sample:${pid}`,
        town,
        parcelNumber: `SAMPLE-${pid}`,
        visionPid: pid,
        street,
        assessedValue: row.assessed_value ?? null,
        taxYearEnd: null,
      },
    ]
  })
}

function reportText(result: CamaTaxSyncResult): void {
  console.info(
    `${LOG} anchor FY${result.anchorFiscalYearEnd} — filling FY${result.towns[0]?.fiscalYears.join(', FY') ?? '—'}`,
  )
  for (const town of result.towns) {
    if (town.skippedReason) {
      console.info(`${LOG} ${town.town}: SKIPPED — ${town.skippedReason}`)
      continue
    }
    const strategies = Object.entries(town.matchStrategies)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ')
    console.info(
      `${LOG} ${town.town}: parcels=${town.camaParcels.toLocaleString()} ` +
        `vintages=[${town.camaVintagesUsed.join(',')}] ` +
        `listings=${town.listings.toLocaleString()} matched=${town.matched.toLocaleString()} ` +
        `unmatched=${town.unmatched.toLocaleString()}${strategies ? ` (${strategies})` : ''}`,
    )
    console.info(
      `${LOG} ${town.town}: rows computed=${town.rowsComputed.toLocaleString()} ` +
        `carried-forward=${town.rowsCarriedForward.toLocaleString()} ` +
        `deferred-to-mls=${town.rowsDeferredToMls.toLocaleString()} ` +
        `shared-assessor-record=${town.sharedRecordListings.toLocaleString()} ` +
        `written=${town.rowsWritten.toLocaleString()}`,
    )
    const skips = Object.entries(town.computeSkips).filter(([, n]) => (n ?? 0) > 0)
    if (skips.length > 0) {
      console.info(
        `${LOG} ${town.town}: skips ${skips.map(([k, n]) => `${k}=${n}`).join(' ')}`,
      )
    }
    for (const sample of town.samples) {
      console.info(
        `${LOG}   ${sample.parcelNumber} ${sample.taxYearLabel}: ` +
          `$${sample.amount.toLocaleString()} ` +
          `= $${sample.assessedValue.toLocaleString()} x ${sample.millRate} / 1000` +
          `${sample.assessmentCarriedForward ? ` (assessment carried from GL${sample.assessmentYear})` : ''}`,
      )
    }
  }
  console.info(
    `${LOG} total rows computed=${result.rowsComputed.toLocaleString()} written=${result.rowsWritten.toLocaleString()}` +
      `${result.dryRun ? ' (dry run — nothing written)' : ''}`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const result = await syncCtCamaTaxHistory({
    towns: args.towns.length > 0 ? args.towns : undefined,
    dryRun: args.dryRun,
    limitPerTown: args.limit ?? undefined,
    years: args.years,
    anchorFiscalYearEnd: args.anchor ?? undefined,
    loadListings: args.sample
      ? async (town) => sampleListings(town)
      : undefined,
    onProgress: args.json ? undefined : (message) => console.info(`${LOG} ${message}`),
  })

  if (args.json) {
    console.info(JSON.stringify(result, null, 2))
  } else {
    reportText(result)
  }

  // Admin reads this stamp for the job's End clock and the scheduler compares it
  // against the monthly slot. Without it a CLI backfill leaves Admin claiming
  // the job has never run, and the next sweep repeats work already done.
  if (!args.dryRun && !args.sample) {
    const { setSyncMetaDurable } = await import('../lib/db/sync-meta-store')
    await setSyncMetaDurable('cama_tax_history_synced_at', result.finishedAt)
    console.info(`${LOG} stamped cama_tax_history_synced_at=${result.finishedAt}`)
  }
}

main().catch((err) => {
  console.error(`${LOG} fatal`, err)
  process.exit(1)
})
