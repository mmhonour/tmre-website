export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { syncAllTownListings } = await import('./lib/listings-sync')
    const { rebuildStatsCacheIfStale, STATS_CACHE_TTL_MS } = await import('./lib/stats-cache')
    const { hasLocalListingsCache } = await import('./lib/listings-store')
    const { getSyncMeta } = await import('./lib/listings-db')

    const allowListingsSync =
      process.env.ENABLE_BACKGROUND_SQLITE_REFRESH === '1' ||
      process.env.NETLIFY === 'true' ||
      process.env.NODE_ENV === 'production'

    if (allowListingsSync) {
      const runListingsSync = () => {
        syncAllTownListings().catch((err) => {
          console.error('[listings-sync/instrumentation]', err)
        })
      }

      const listingsIntervalMs = Number(process.env.LISTINGS_SYNC_INTERVAL_MS ?? '0')
      if (Number.isFinite(listingsIntervalMs) && listingsIntervalMs >= 60_000) {
        setTimeout(runListingsSync, 10_000)
        setInterval(runListingsSync, listingsIntervalMs)
        console.info(
          `[listings-sync] scheduled every ${Math.round(listingsIntervalMs / 60_000)} minutes`,
        )
      } else if (process.env.NETLIFY && !hasLocalListingsCache()) {
        // Cold serverless start with empty /tmp — warm SQLite from MLS once.
        setTimeout(runListingsSync, 8_000)
        console.info('[listings-sync] warming empty SQLite cache on startup')
      }
    } else {
      console.info(
        '[instrumentation] background listings sync disabled in dev — run `npm run sync:listings` separately',
      )
    }

    const statsRefreshMs = Number(
      process.env.STATS_CACHE_REFRESH_MS ?? String(STATS_CACHE_TTL_MS),
    )
    if (Number.isFinite(statsRefreshMs) && statsRefreshMs >= 60_000) {
      const refreshStats = () => {
        if (!hasLocalListingsCache()) return
        if (getSyncMeta('refresh_in_progress') === '1') {
          console.info('[stats-cache] skipped — listings refresh in progress')
          return
        }
        try {
          rebuildStatsCacheIfStale(true)
        } catch (err) {
          console.error('[stats-cache/instrumentation]', err)
        }
      }
      setTimeout(refreshStats, 20_000)
      setInterval(refreshStats, statsRefreshMs)
      console.info(
        `[stats-cache] refresh scheduled every ${Math.round(statsRefreshMs / 60_000)} minutes`,
      )
    }
  } catch (err) {
    console.warn('[instrumentation] startup hooks disabled:', err)
  }
}
