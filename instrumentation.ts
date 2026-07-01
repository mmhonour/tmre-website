export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { syncAllTownListings } = await import('./lib/listings-sync')
  const { rebuildStatsCacheIfStale, STATS_CACHE_TTL_MS } = await import('./lib/stats-cache')
  const { hasLocalListingsCache } = await import('./lib/listings-store')

  const listingsIntervalMs = Number(process.env.LISTINGS_SYNC_INTERVAL_MS ?? '0')
  if (Number.isFinite(listingsIntervalMs) && listingsIntervalMs >= 60_000) {
    const run = () => {
      syncAllTownListings().catch((err) => {
        console.error('[listings-sync/instrumentation]', err)
      })
    }
    setTimeout(run, 10_000)
    setInterval(run, listingsIntervalMs)
    console.info(`[listings-sync] scheduled every ${Math.round(listingsIntervalMs / 60_000)} minutes`)
  }

  const statsRefreshMs = Number(
    process.env.STATS_CACHE_REFRESH_MS ?? String(STATS_CACHE_TTL_MS),
  )
  if (Number.isFinite(statsRefreshMs) && statsRefreshMs >= 60_000) {
    const refreshStats = () => {
      if (!hasLocalListingsCache()) return
      try {
        rebuildStatsCacheIfStale(true)
      } catch (err) {
        console.error('[stats-cache/instrumentation]', err)
      }
    }
    setTimeout(refreshStats, 20_000)
    setInterval(refreshStats, statsRefreshMs)
    console.info(`[stats-cache] refresh scheduled every ${Math.round(statsRefreshMs / 60_000)} minutes`)
  }
}
