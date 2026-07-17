import { isNextProductionBuild } from './lib/build-sync-gate'
import { isServerlessRuntime } from './lib/runtime-host'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  if (isNextProductionBuild()) {
    console.info('[instrumentation] skipping sync/warming during next build')
    return
  }

  // Hydrate the Postgres-backed sync_meta cache before any handler reads it.
  // Kept non-fatal so local dev without DATABASE_URL still boots.
  try {
    const { hydrateSyncMetaStore } = await import('./lib/db/sync-meta-store')
    await hydrateSyncMetaStore()
    console.info('[sync-meta] cache hydrated from Postgres')
  } catch (err) {
    console.warn('[sync-meta] hydrate failed (continuing):', err)
  }

  try {
    const { syncListingsSmart, syncIncrementalListings, syncAllTownListings } =
      await import('./lib/listings-sync')
    const { rebuildStatsCacheIfStale, STATS_CACHE_TTL_MS } = await import('./lib/stats-cache')
    const { LATEST_DB_REFRESH_MS } = await import('./lib/latest-refresh')
    const { hasLocalListingsCache } = await import('./lib/listings-store')
    const { getSyncMeta } = await import('./lib/db/sync-meta-store')
    const { isScheduledSyncJobPaused } = await import('./lib/scheduled-sync-toggle')
    const { isRetsConfigured } = await import('./lib/rets')

    const retsConfigured = isRetsConfigured()
    const overdueCatchupEnabled = process.env.ENABLE_OVERDUE_SYNC_CATCHUP !== '0'

    const allowListingsSync =
      process.env.ENABLE_BACKGROUND_SQLITE_REFRESH === '1' ||
      process.env.NETLIFY === 'true' ||
      process.env.NODE_ENV === 'production'

    // After host wakeup, serially run any sync windows missed while offline (~2 min delay).
    if (overdueCatchupEnabled) {
      const { runOverdueSyncCatchup } = await import('./lib/sync-overdue')
      const catchupDelayMs = Math.max(
        60_000,
        Number(process.env.OVERDUE_SYNC_CATCHUP_DELAY_MS ?? '120000'),
      )
      const scheduleCatchup = (reason: string) => {
        setTimeout(() => {
          runOverdueSyncCatchup({ reason }).catch((err) => {
            console.error('[sync-overdue/startup]', err)
          })
        }, catchupDelayMs)
        console.info(
          `[sync-overdue] missed-sync catch-up scheduled in ${Math.round(catchupDelayMs / 1000)}s (${reason})`,
        )
      }

      if (!isServerlessRuntime()) {
        scheduleCatchup('node-startup')
      } else {
        // Serverless timers may not fire; scheduled Netlify functions also invoke catch-up.
        scheduleCatchup('netlify-process')
      }
    }

    // Full MLS → Postgres rebuild on process start when overdue catch-up is disabled.
    const startupFullEnabled =
      process.env.ENABLE_STARTUP_FULL_SYNC !== '0' &&
      !overdueCatchupEnabled &&
      retsConfigured &&
      process.env.NETLIFY !== 'true'
    if (startupFullEnabled) {
      const startupDelayMs = Math.max(
        2_000,
        Number(process.env.STARTUP_FULL_SYNC_DELAY_MS ?? '8000'),
      )
      setTimeout(() => {
        console.info('[listings-sync] startup full reload + score rebuild beginning…')
        syncAllTownListings().catch((err) => {
          console.error('[listings-sync/startup-full]', err)
        })
      }, startupDelayMs)
      console.info(
        `[listings-sync] startup full reload scheduled in ${Math.round(startupDelayMs / 1000)}s`,
      )
    }

    // Latest updates: incremental RETS → Postgres sync on a 30-minute cadence.
    // Runs wherever RETS credentials exist (including local:dev) so the /latest
    // page is always served from the database, never a per-request RETS pull.
    const latestSyncEnabled =
      process.env.ENABLE_LATEST_SYNC !== '0' && (allowListingsSync || retsConfigured)
    if (latestSyncEnabled && !isServerlessRuntime()) {
      const latestIntervalMs = Math.max(
        60_000,
        Number(process.env.LATEST_SYNC_INTERVAL_MS ?? String(LATEST_DB_REFRESH_MS)),
      )
      let latestSyncRunning = false
      const runLatestSync = () => {
        if (latestSyncRunning) return
        if (isScheduledSyncJobPaused('incremental')) return
        latestSyncRunning = true
        Promise.resolve()
          .then(() => syncIncrementalListings())
          .then(async () => {
            // Refresh only the spotlight listings' status (incl. off-market
            // states the Active-only incremental never revisits) into Postgres.
            const { refreshSpotlightStatuses } = await import('./lib/spotlight-status-sync')
            await refreshSpotlightStatuses()
          })
          .catch((err) => console.error('[latest-sync/instrumentation]', err))
          .finally(() => {
            latestSyncRunning = false
          })
      }
      // Give the startup full reload a head start before the first incremental.
      setTimeout(runLatestSync, startupFullEnabled ? 90_000 : 12_000)
      setInterval(runLatestSync, latestIntervalMs)
      console.info(
        `[latest-sync] incremental sync scheduled every ${Math.round(latestIntervalMs / 60_000)} minutes`,
      )
    } else if (latestSyncEnabled && isServerlessRuntime()) {
      console.info(
        '[latest-sync] skipped inline on serverless — netlify/functions/sync-listings cron handles incremental',
      )
    }

    // Weekly full MLS reload + Goldilocks score rebuild at 5:00 AM Monday America/New_York.
    // Netlify uses netlify/functions/sync-listings-full.ts for production; this covers
    // long-lived Node processes (local:dev / non-serverless hosts).
    const fullReloadEnabled =
      process.env.ENABLE_DAILY_FULL_SYNC !== '0' && (allowListingsSync || retsConfigured)
    if (fullReloadEnabled) {
      const { msUntilNextMondayTimeEt } = await import('./lib/admin-sync-schedule')
      const scheduleNextFullReload = () => {
        const waitMs = msUntilNextMondayTimeEt(5, 0)
        console.info(
          `[listings-sync] next weekly full reload + score rebuild in ${Math.round(waitMs / 60_000)} minutes (Mon 5am ET)`,
        )
        setTimeout(() => {
          if (isScheduledSyncJobPaused('full-resync')) {
            console.info('[listings-sync] weekly full reload skipped — full-resync paused by admin')
            scheduleNextFullReload()
            return
          }
          syncAllTownListings()
            .catch((err) => console.error('[listings-sync/weekly-full]', err))
            .finally(() => scheduleNextFullReload())
        }, waitMs)
      }
      scheduleNextFullReload()
    }

    if (allowListingsSync) {
      const runListingsSync = () => {
        if (isScheduledSyncJobPaused('incremental')) return
        syncListingsSmart().catch((err) => {
          console.error('[listings-sync/instrumentation]', err)
        })
      }

      const listingsIntervalMs = Number(process.env.LISTINGS_SYNC_INTERVAL_MS ?? '0')
      if (isServerlessRuntime() && process.env.NETLIFY === 'true') {
        const { ensurePostDeployFullResyncScheduled } = await import(
          './lib/deploy-full-resync-schedule'
        )
        setTimeout(() => {
          void ensurePostDeployFullResyncScheduled().catch((err) => {
            console.error('[deploy-full-resync/startup]', err)
          })
        }, 8_000)
      } else if (Number.isFinite(listingsIntervalMs) && listingsIntervalMs >= 60_000) {
        setTimeout(runListingsSync, 10_000)
        setInterval(runListingsSync, listingsIntervalMs)
        console.info(
          `[listings-sync] scheduled every ${Math.round(listingsIntervalMs / 60_000)} minutes`,
        )
      } else if (!(await hasLocalListingsCache())) {
        setTimeout(runListingsSync, 8_000)
        console.info('[listings-sync] warming empty Postgres inventory on startup')
      }
    } else if (!startupFullEnabled) {
      console.info(
        '[instrumentation] background listings sync disabled — set RETS_* in .env.local or run `npm run sync:listings`',
      )
    }

    const statsRefreshMs = Number(
      process.env.STATS_CACHE_REFRESH_MS ?? String(STATS_CACHE_TTL_MS),
    )
    if (Number.isFinite(statsRefreshMs) && statsRefreshMs >= 60_000) {
      const refreshStats = async () => {
        if (isScheduledSyncJobPaused('stats-cache')) return
        if (!(await hasLocalListingsCache())) return
        if (getSyncMeta('refresh_in_progress') === '1') {
          console.info('[stats-cache] skipped — listings refresh in progress')
          return
        }
        void rebuildStatsCacheIfStale(true).catch((err) => {
          console.error('[stats-cache/instrumentation]', err)
        })
      }
      setTimeout(refreshStats, 20_000)
      setInterval(refreshStats, statsRefreshMs)
      console.info(
        `[stats-cache] refresh scheduled every ${Math.round(statsRefreshMs / 60_000)} minutes`,
      )
    }

    const warmListingSuperlatives = async () => {
      if (!(await hasLocalListingsCache())) return
      if (getSyncMeta('refresh_in_progress') === '1') return
      void import('./lib/listing-superlatives-rebuild')
        .then(({ rebuildAllListingSuperlativesIfMissing }) =>
          rebuildAllListingSuperlativesIfMissing(),
        )
        .then((result) => {
          if (result.skipped) return
          console.info(
            `[listing-superlatives] warmed ${result.totalComputed} entries in ${result.durationMs}ms`,
          )
        })
        .catch((err) => console.error('[listing-superlatives/instrumentation]', err))
    }
    setTimeout(warmListingSuperlatives, 22_000)

    const warmDealOfTheDayCache = async () => {
      if (!(await hasLocalListingsCache())) return
      // Weekly full sync rebuilds DOTD after listings + scores; skip if cache exists or sync running.
      if (getSyncMeta('refresh_in_progress') === '1') return
      void import('./lib/deal-of-the-day-cache')
        .then(({ rebuildDealOfTheDayCacheIfMissing }) => rebuildDealOfTheDayCacheIfMissing())
        .then((result) => {
          if (result.skipped) return
          console.info(
            `[deal-of-the-day-cache] warmed ${result.written} entries in ${result.durationMs}ms`,
          )
        })
        .catch((err) => console.error('[deal-of-the-day-cache/instrumentation]', err))
    }
    setTimeout(warmDealOfTheDayCache, 25_000)

    const propertyAddressSyncEnabled = process.env.ENABLE_PROPERTY_ADDRESS_SYNC !== '0'
    if (propertyAddressSyncEnabled && allowListingsSync) {
      const { msUntilNextMonday1amEt } = await import('./lib/property-address-schedule')
      const { syncPropertyAddresses } = await import('./lib/property-address-sync')
      let propertyAddressSyncRunning = false
      const schedulePropertyAddressSync = () => {
        const waitMs = msUntilNextMonday1amEt()
        console.info(
          `[property-address-sync] next weekly verify in ${Math.round(waitMs / 60_000)} minutes (Mon 1am ET)`,
        )
        setTimeout(() => {
          if (isScheduledSyncJobPaused('property-addresses')) {
            console.info(
              '[property-address-sync] weekly verify skipped — property-addresses paused by admin',
            )
            schedulePropertyAddressSync()
            return
          }
          if (propertyAddressSyncRunning) {
            schedulePropertyAddressSync()
            return
          }
          propertyAddressSyncRunning = true
          Promise.resolve()
            .then(() => syncPropertyAddresses())
            .catch((err) => console.error('[property-address-sync/instrumentation]', err))
            .finally(() => {
              propertyAddressSyncRunning = false
              schedulePropertyAddressSync()
            })
        }, waitMs)
      }
      schedulePropertyAddressSync()
    }

    const edgeScoreRebuildEnabled = process.env.ENABLE_EDGE_SCORE_REBUILD !== '0'
    if (edgeScoreRebuildEnabled && allowListingsSync) {
      const { msUntilNextMonday2amEt } = await import('./lib/listing-edge-schedule')
      const { rebuildAllListingEdgeScores } = await import('./lib/listing-edge-score')
      let edgeScoreRebuildRunning = false
      const scheduleEdgeScoreRebuild = () => {
        const waitMs = msUntilNextMonday2amEt()
        console.info(
          `[listing-edge-scores] next weekly rebuild in ${Math.round(waitMs / 60_000)} minutes (Mon 2am ET)`,
        )
        setTimeout(() => {
          if (isScheduledSyncJobPaused('listing-scores')) {
            console.info(
              '[listing-edge-scores] weekly rebuild skipped — listing-scores paused by admin',
            )
            scheduleEdgeScoreRebuild()
            return
          }
          if (edgeScoreRebuildRunning) {
            scheduleEdgeScoreRebuild()
            return
          }
          edgeScoreRebuildRunning = true
          Promise.resolve()
            .then(() => rebuildAllListingEdgeScores())
            .catch((err) => console.error('[listing-edge-scores/instrumentation]', err))
            .finally(() => {
              edgeScoreRebuildRunning = false
              scheduleEdgeScoreRebuild()
            })
        }, waitMs)
      }
      scheduleEdgeScoreRebuild()
    }
  } catch (err) {
    console.warn('[instrumentation] startup hooks disabled:', err)
  }
}
