#!/usr/bin/env node
/**
 * Warm photo index 0 for Closed properties that already appear as associated
 * Sales (`comp_sold`) or Rentals (`rental_sold`) comps on listing/Spotlight tabs.
 *
 * Usage:
 *   npm run warm:associated-closed-photos -- --dry-run
 *   npm run warm:associated-closed-photos -- --concurrency=2
 *   npm run warm:associated-closed-photos -- --limit=50
 */
import { existsSync } from 'node:fs'
import {
  listAssociatedClosedPhotoTargets,
  warmAssociatedClosedPhotos,
} from '../lib/warm-associated-closed-photos'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

function argValue(flag: string): string | null {
  const prefix = `${flag}=`
  for (const arg of process.argv.slice(2)) {
    if (arg === flag) return 'true'
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

async function main() {
  const dryRun = argValue('--dry-run') === 'true'
  const concurrency = Math.max(1, Number(argValue('--concurrency') ?? '2') || 2)
  const limitRaw = argValue('--limit')
  const limit = limitRaw != null ? Math.max(0, Number(limitRaw) || 0) : 0

  console.info(
    `[warm-associated-closed-photos] starting` +
      `${dryRun ? ' (dry-run)' : ''}` +
      ` · concurrency=${concurrency}` +
      (limit > 0 ? ` · limit=${limit}` : ''),
  )

  if (dryRun) {
    const targets = await listAssociatedClosedPhotoTargets(limit)
    const sales = targets.filter((t) => t.relation === 'comp_sold').length
    const rentals = targets.filter((t) => t.relation === 'rental_sold').length
    console.info(
      `[warm-associated-closed-photos] dry-run — ${targets.length} distinct Closed comps` +
        ` (${sales} sale edges, ${rentals} rental edges)`,
    )
    for (const t of targets.slice(0, 20)) {
      console.info(
        `  ${t.relation} · ${t.mlsId} · ${t.address}` +
          (t.photoCount != null ? ` · photos=${t.photoCount}` : ''),
      )
    }
    if (targets.length > 20) {
      console.info(`  … ${targets.length - 20} more`)
    }
    return
  }

  const result = await warmAssociatedClosedPhotos({
    concurrency,
    limit,
    onProgress: ({ index, total, target, ok, cacheHit }) => {
      const status = !ok ? 'FAIL' : cacheHit ? 'cached' : 'stored'
      console.info(
        `  [${index}/${total}] ${status} · ${target.relation} · ${target.mlsId} · ${target.address}`,
      )
    },
  })

  console.info(
    `[warm-associated-closed-photos] done — candidates=${result.candidates}` +
      ` stored=${result.warmed} alreadyCached=${result.alreadyCached}` +
      ` failed=${result.failed}`,
  )

  if (result.failed > 0 && result.warmed === 0 && result.alreadyCached === 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[warm-associated-closed-photos] fatal', err)
  process.exit(1)
})
