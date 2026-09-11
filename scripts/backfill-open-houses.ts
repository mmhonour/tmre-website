/**
 * Catalogue historical SmartMLS OpenHouse events into Neon.
 *
 * This is not the hourly /open-houses calendar job. That job only replaces
 * today → +90 days. This script upserts the prior year (newest-first 14-day
 * slices) so Most / First / pastCount have real history. Re-runs are safe.
 *
 * Needs DATABASE_URL + RETS_* in .env.local (point DATABASE_URL at the Neon
 * the site uses if you want production cards to pick this up).
 *
 *   npm run backfill:open-houses
 *   npm run backfill:open-houses -- --days=365 --chunk-days=14
 *   npm run backfill:open-houses -- --max-minutes=45
 *   npm run backfill:open-houses -- --oldest-first
 *
 * PowerShell (repo root):
 *   .\scripts\backfill-open-houses.ps1
 *   .\scripts\backfill-open-houses.ps1 -MaxMinutes 45
 */
import { existsSync } from 'node:fs'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import { OPEN_HOUSE_LOOKBACK_DAYS } from '../lib/open-houses'
import {
  lookbackWindowForDays,
  parseBackfillOpenHouseArgs,
} from '../lib/open-houses-backfill'
import { backfillOpenHouseHistory } from '../lib/open-houses-sync'
import { isRetsConfigured, retsSyncBlockedMessage } from '../lib/rets'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

async function main() {
  const args = parseBackfillOpenHouseArgs(process.argv.slice(2))
  const lookback = lookbackWindowForDays(args.days)

  console.log('[backfill:open-houses] catalogue pass (not the hourly calendar job)')
  console.log(
    `[backfill:open-houses] window ${lookback.start} → ${lookback.end} · chunks ${args.chunkDays}d · ${
      args.oldestFirst ? 'oldest-first' : 'newest-first'
    }${args.maxMinutes != null ? ` · stop after ${args.maxMinutes}m` : ''}`,
  )
  if (args.days > OPEN_HOUSE_LOOKBACK_DAYS) {
    console.warn(
      `[backfill:open-houses] --days=${args.days} is older than the hourly prune horizon (${OPEN_HOUSE_LOOKBACK_DAYS}d). The next Open houses job will delete rows before that horizon.`,
    )
  }

  if (!isRetsConfigured()) {
    throw new Error(retsSyncBlockedMessage())
  }

  await hydrateSyncMetaStore()

  const result = await backfillOpenHouseHistory(lookback, {
    chunkDays: args.chunkDays,
    newestFirst: !args.oldestFirst,
    budgetMs: args.maxMinutes != null ? args.maxMinutes * 60 * 1000 : undefined,
    onChunk: (progress) => {
      const n = progress.index + 1
      const label = `${progress.chunk.start} → ${progress.chunk.end}`
      if (progress.error) {
        console.warn(
          `[backfill:open-houses] ${n}/${progress.total} ${label} skipped: ${progress.error}`,
        )
        return
      }
      console.log(
        `[backfill:open-houses] ${n}/${progress.total} ${label} fetched ${progress.fetched} · upserted ${progress.written}`,
      )
    },
  })

  if (!result.ok) {
    throw new Error(result.error ?? 'open house history backfill failed')
  }

  console.log(
    `[backfill:open-houses] done upserted=${result.written} chunks=${result.chunks} incomplete=${result.incomplete} ${result.durationMs}ms`,
  )
  if (result.incomplete) {
    console.log(
      '[backfill:open-houses] stopped early — run again to continue (upserts are idempotent)',
    )
  }
}

main().catch((err) => {
  console.error(
    '[backfill:open-houses] FAILED:',
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})
