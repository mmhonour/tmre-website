import { cookies } from "next/headers";
import AdminProductDocsPanel from "@/components/admin/AdminProductDocsPanel";
import AdminRetsConnectionPanel from "@/components/admin/AdminRetsConnectionPanel";
import AdminRetsCredentialsPanel from "@/components/admin/AdminRetsCredentialsPanel";
import AdminServerFunctionsPanel from "@/components/admin/AdminServerFunctionsPanel";
import AdminSpotlightSitePanel from "@/components/admin/AdminSpotlightSitePanel";
import AdminSqliteDiagrams from "@/components/admin/AdminSqliteDiagrams";
import AdminSyncHistoryPanel from "@/components/admin/AdminSyncHistoryPanel";
import AdminSyncRunLog from "@/components/admin/AdminSyncRunLog";
import AdminSyncsOverviewPanel from "@/components/admin/AdminSyncsOverviewPanel";
import AdminDbTuningPanel from "@/components/admin/AdminDbTuningPanel";
import AdminPhotoHealthPanel from "@/components/admin/AdminPhotoHealthPanel";
import AdminPhotoTtlPanel from "@/components/admin/AdminPhotoTtlPanel";
import AdminBrokeragePanel from "@/components/admin/AdminBrokeragePanel";
import AdminContactEmailPanel from "@/components/admin/AdminContactEmailPanel";
import AdminContactPhonePanel from "@/components/admin/AdminContactPhonePanel";
import AdminCommunicationsPanel from "@/components/admin/AdminCommunicationsPanel";
import AdminMarketDigestPanel from "@/components/admin/AdminMarketDigestPanel";
import AdminDeployNotifyPanel from "@/components/admin/AdminDeployNotifyPanel";
import AdminSocialProfilesPanel from "@/components/admin/AdminSocialProfilesPanel";
import AdminGoldilocksPanel from "@/components/admin/AdminGoldilocksPanel";
import AdminPricingPanel from "@/components/admin/AdminPricingPanel";
import AdminDataControlsPanel from "@/components/admin/AdminDataControlsPanel";
import AdminDatabasePanel from "@/components/admin/AdminDatabasePanel";
import AdminSyncsPanel from "@/components/admin/AdminSyncsPanel";
import AdminDatabaseInventoryPanel from "@/components/admin/AdminDatabaseInventoryPanel";
import AdminInventoryComparisonPanel from "@/components/admin/AdminInventoryComparisonPanel";
import AdminVintagesPanel from "@/components/admin/AdminVintagesPanel";
import AdminBrowserCookiesPanel from "@/components/admin/AdminBrowserCookiesPanel";
import AdminInventorySegmentBandsPanel from "@/components/admin/AdminInventorySegmentBandsPanel";
import AdminArchitecturePanel from "@/components/admin/AdminArchitecturePanel";
import AdminSiteArchitecturePanel from "@/components/admin/AdminSiteArchitecturePanel";
import { readDeployBuildInfo } from "@/lib/deploy-build-info";
import { emptyScheduledSyncPausedJobs } from "@/lib/scheduled-sync-jobs-shared";
import {
  ZIP_BOUNDARIES_LAST_SYNC_KEY,
  ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY,
  zipBoundariesInventory,
} from "@/lib/zip-boundary-cache";
import {
  DB_UPSERT_CHUNK_ROWS_DEFAULT,
  DB_UPSERT_CHUNK_ROWS_MAX,
  DB_UPSERT_CHUNK_ROWS_MIN,
  getUpsertChunkRows,
} from "@/lib/db/db-write-tuning";
import {
  ACTIVE_LISTINGS_FETCH_LIMIT,
  ACTIVE_LISTINGS_FETCH_LIMIT_MAX,
  ACTIVE_LISTINGS_FETCH_LIMIT_MIN,
  CLOSED_LISTINGS_FETCH_LIMIT,
  EXPIRED_LISTINGS_FETCH_LIMIT,
  getActiveListingsFetchLimit,
} from "@/lib/listings-store";
import {
  getListingPhotoTtlMinutesFresh,
  LISTING_PHOTO_TTL_MINUTES_DEFAULT,
  LISTING_PHOTO_TTL_MINUTES_MAX,
  LISTING_PHOTO_TTL_MINUTES_MIN,
} from "@/lib/listing-photo-ttl-config";
import {
  getContactNotifyEmailFresh,
  DEFAULT_CONTACT_NOTIFY_EMAIL,
} from "@/lib/contact-notify-config";
import { getMarketDigestConfigFresh } from "@/lib/market-digest-config";
import { getDeployNotifyConfigFresh } from "@/lib/deploy-notify-config";
import { getSocialProfilesFresh } from "@/lib/social-profiles-config";
import {
  getBrokerageNameFresh,
  DEFAULT_BROKERAGE_NAME,
} from "@/lib/brokerage-config";
import {
  getContactPhoneFresh,
  DEFAULT_CONTACT_PHONE_DIGITS,
} from "@/lib/phone-config";
import { formatPhoneDisplay } from "@/lib/business-info";
import { describePostgresTarget } from "@/lib/db/postgres-target";
import {
  DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  getGoldilocksConfigFresh,
  goldilocksScoresNeedRebuild,
  goldilocksWeightSum,
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_HINTS,
  GOLDILOCKS_KEYWORD_GROUP_LABELS,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  isDefaultGoldilocksConfig,
} from "@/lib/goldilocks-config";
import { FACTOR_DESCRIPTIONS, FACTOR_LABELS } from "@/lib/goldilocks-score-info";
import {
  COMPARABLES_LOOKBACK_OPTIONS,
} from "@/lib/listing-comparables-shared";
import {
  DEFAULT_PRICING_MATCHING_CONFIG,
  getPricingMatchingConfigFresh,
  isDefaultPricingMatchingConfig,
  PRICING_MATCHING_FIELD_META,
} from "@/lib/pricing-matching-config";
import { type AdminSyncRow, type PanelStatus } from "@/components/admin/AdminSyncTable";
import AdminStatsInventoryPanel from "@/components/admin/AdminStatsInventoryPanel";
import AdminGlossaryPanel from "@/components/admin/AdminGlossaryPanel";
import { getScheduledSyncPausedJobsFresh } from "@/lib/scheduled-sync-toggle";
import AdminTabbedLayout from "@/components/admin/AdminTabbedLayout";
import SitePasswordGate from "@/components/SitePasswordGate";
import {
  ADMIN_SYNC_HISTORY_DEFAULT_DAYS,
  ADMIN_SYNC_HISTORY_MAX_LIMIT,
} from "@/lib/admin-sync-history-glom";
import {
  readAdminSyncRunHistory,
  readInventorySnapshot,
  readLatestListingModificationTimestamp,
  type InventorySnapshot,
} from "@/lib/db/listings-repo";
import { getSyncMeta } from "@/lib/db/sync-meta-store";
import { isR2PhotoStoreConfigured } from "@/lib/r2-photo-store";
import {
  describePhotosBlobPersistRuntime,
  ensureAdminListingPhotosReady,
} from "@/lib/listing-photos-db-persist";
import { ensurePostDeployFullResyncScheduled } from "@/lib/deploy-full-resync-schedule";
import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { mlsTimestampDate } from "@/lib/mls-time";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import { describePostgresDatabase } from "@/lib/postgres-schema-diagram";
import { describeRunningSqliteDatabases } from "@/lib/sqlite-schema-diagram";
import { describeStartupProcess } from "@/lib/startup-process";
import { readAdminSyncPanelStatus } from "@/lib/admin-sync-actions";
import { collectAdminDatabaseSyncStats } from "@/lib/sqlite-sync-stats";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — TMRE",
  description: "Database sync status and latest MLS update timestamps.",
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMlsTimestamp(iso: string | null | undefined): string {
  const date = mlsTimestampDate(iso);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type StatusRow = AdminSyncRow & {
  sortMs: number;
};

function timestampSortMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function mlsTimestampSortMs(iso: string | null | undefined): number {
  return mlsTimestampDate(iso)?.getTime() ?? 0;
}

function pairSyncFinished(
  started: string | null | undefined,
  finished: string | null | undefined,
): string | null {
  if (!finished) return null;
  if (!started) return finished;
  const startedMs = Date.parse(started);
  const finishedMs = Date.parse(finished);
  if (Number.isNaN(startedMs) || Number.isNaN(finishedMs)) return finished;
  return finishedMs >= startedMs ? finished : null;
}

export default async function AdminPage() {
  const jar = await cookies();
  const unlocked = jar.get(SITE_PASSWORD_COOKIE)?.value === "1";

  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Admin access."
        subtitle="Enter the TMRE password to view sync status and database timestamps."
      />
    );
  }

  // The Admin/status page fires many DB + blob reads. Historically these were
  // awaited directly, so a SINGLE failing read (e.g. Neon rejecting reads when
  // the data-transfer quota is exhausted) threw all the way out and 500'd the
  // whole page — the worst outcome for the one page you need to diagnose from.
  // Each risky read now degrades to a fallback and records its error, and the
  // failures are surfaced in a banner so the real cause is visible on-page.
  const loadErrors: string[] = [];
  const safe = async <T,>(
    label: string,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      loadErrors.push(
        `${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return fallback;
    }
  };

  await safe("photos-ready", () => ensureAdminListingPhotosReady(), false);
  const scheduledSyncPausedJobs = await safe(
    "scheduled-sync-flag",
    () => getScheduledSyncPausedJobsFresh(),
    emptyScheduledSyncPausedJobs(),
  );
  await safe(
    "post-deploy-schedule",
    async () => {
      await ensurePostDeployFullResyncScheduled();
      return null;
    },
    null,
  );

  const {
    stats,
    refresh,
    nextRuns,
    scheduleHints,
    lastIncrementalCronTick,
    nextOverrides,
  } = await readAdminSyncPanelStatus();
  const latestListingUpdate = await safe(
    "latest-mls-timestamp",
    () => readLatestListingModificationTimestamp(),
    null,
  );
  const lastRefreshFinished = getSyncMeta("last_refresh_finished_at");
  const lastRefreshStarted = getSyncMeta("last_refresh_started_at");
  const propertyAddressesSyncedAt = getSyncMeta("property_addresses_synced_at");
  const zipBoundariesSyncedAt = getSyncMeta(ZIP_BOUNDARIES_LAST_SYNC_KEY);
  const zipBoundariesSyncStartedAt = getSyncMeta(ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY);
  const zipInventory = await safe(
    "zip-boundaries-inventory",
    () => zipBoundariesInventory(),
    {
      storedCount: 0,
      expectedCount: 0,
      oldestFetchedAt: null,
      newestFetchedAt: null,
      stale: true,
    },
  );
  const refreshFinishedAt = lastRefreshFinished ?? refresh.lastFinishedAt;
  const postgresDiagram = await describePostgresDatabase();
  const sqliteDiagrams = [postgresDiagram, ...describeRunningSqliteDatabases()];
  const databaseStats = await safe(
    "database-sync-stats",
    () => collectAdminDatabaseSyncStats(),
    [],
  );
  const syncRunHistory = await safe(
    "sync-run-history",
    () =>
      readAdminSyncRunHistory({
        limit: ADMIN_SYNC_HISTORY_MAX_LIMIT,
        offset: 0,
        since: new Date(
          Date.now() - ADMIN_SYNC_HISTORY_DEFAULT_DAYS * 24 * 60 * 60 * 1000,
        ),
      }),
    {
      runs: [],
      total: 0,
      limit: ADMIN_SYNC_HISTORY_MAX_LIMIT,
      offset: 0,
      since: null,
    },
  );
  const blobRuntime = await safe("photos-blob-runtime", () => describePhotosBlobPersistRuntime(), {
    active: false,
    mode: "local-file" as const,
    reason: "unavailable — read failed",
    lastPersistAt: null,
    lastPersistResult: null,
    lastRestoreAt: null,
  });
  // Photos live in R2 now; the SQLite-on-Netlify-Blobs runtime banner + blob
  // restore/checkpoint lines are legacy and only meaningful without R2.
  const photosOnR2 = isR2PhotoStoreConfigured();
  const inventorySnapshot = await readInventorySnapshot();
  const listingsDbEmpty = stats.total === 0;
  const startupProcess = describeStartupProcess();

  const rows: StatusRow[] = [
    {
      id: "full-resync",
      label: "Full resync",
      value: formatTimestamp(stats.lastFullSync),
      startedAt: stats.lastFullSyncStarted,
      finishedAt: pairSyncFinished(stats.lastFullSyncStarted, stats.lastFullSync),
      sortMs: timestampSortMs(stats.lastFullSync),
      detail: "Complete MLS → Postgres reload (scheduled weekly Mon ~5am ET; run step 1 manually when needed)",
      actionId: "full-resync",
      nextRunAt: nextRuns["full-resync"],
    },
    {
      id: "incremental",
      label: "Incremental update",
      value: formatTimestamp(stats.lastIncrementalSync),
      startedAt: stats.lastIncrementalSyncStarted,
      finishedAt: pairSyncFinished(
        stats.lastIncrementalSyncStarted,
        stats.lastIncrementalSync,
      ),
      sortMs: timestampSortMs(stats.lastIncrementalSync),
      detail: lastIncrementalCronTick
        ? `Modified-since RETS pull (every ${Math.round(LATEST_DB_REFRESH_MS / 60_000)} minutes) · Cron last fired ${formatTimestamp(lastIncrementalCronTick)}`
        : `Modified-since RETS pull (every ${Math.round(LATEST_DB_REFRESH_MS / 60_000)} minutes) · Cron last fired: never (no Netlify */30 tick yet — Sync now does not stamp the scheduler)`,
      actionId: "incremental",
      nextRunAt: nextRuns.incremental,
    },
    {
      id: "latest-mls",
      label: "Latest MLS listing update",
      value: formatMlsTimestamp(latestListingUpdate),
      finishedAt: latestListingUpdate,
      sortMs: mlsTimestampSortMs(latestListingUpdate),
      detail: "Newest ModificationTimestamp among Active listings in Postgres",
      nextRunAt: nextRuns["latest-mls"],
    },
    {
      id: "listing-scores",
      label: "Goldilocks score rebuild",
      value: formatTimestamp(stats.lastListingScores),
      startedAt: stats.lastListingScoresStarted,
      finishedAt: stats.lastListingScores,
      sortMs: timestampSortMs(stats.lastListingScores),
      detail: "Scores written during the weekly full reload (or manual step 1)",
      actionId: "listing-scores",
      nextRunAt: nextRuns["listing-scores"],
    },
    {
      id: "refresh-finished",
      label: "Refresh finished",
      value: formatTimestamp(refreshFinishedAt),
      startedAt: lastRefreshStarted,
      finishedAt: refreshFinishedAt,
      sortMs: timestampSortMs(refreshFinishedAt),
      detail: refresh.refreshing ? "A refresh is currently in progress" : "Marks the most recent completed MLS refresh into Postgres",
      actionId: "publish-snapshot",
      nextRunAt: nextRuns["refresh-finished"],
    },
    {
      id: "stats-cache",
      label: "Stats cache rebuild",
      value: formatTimestamp(stats.lastStatsCache),
      startedAt: stats.lastStatsCacheStarted,
      finishedAt: stats.lastStatsCache,
      sortMs: timestampSortMs(stats.lastStatsCache),
      detail: "Market stats, sales-by-month, active-by-month, vintage, and price",
      actionId: "stats-cache",
      nextRunAt: nextRuns["stats-cache"],
    },
    {
      id: "deal-of-the-day",
      label: "Deal of the Day cache",
      value: formatTimestamp(stats.lastDealOfTheDayCache),
      startedAt: stats.lastDealOfTheDayCacheStarted,
      finishedAt: stats.lastDealOfTheDayCache,
      sortMs: timestampSortMs(stats.lastDealOfTheDayCache),
      detail: "Deal of the Day picks for every town and kind",
      actionId: "deal-of-the-day",
      nextRunAt: nextRuns["deal-of-the-day"],
    },
    {
      id: "property-addresses",
      label: "Property addresses",
      value: formatTimestamp(propertyAddressesSyncedAt),
      finishedAt: propertyAddressesSyncedAt,
      sortMs: timestampSortMs(propertyAddressesSyncedAt),
      detail:
        "MLS + Vision assessor directory for List With Me autocomplete (weekly Mon 1am ET)",
      actionId: "property-addresses",
      nextRunAt: nextRuns["property-addresses"],
    },
    {
      id: "zip-boundaries",
      label: "Zip boundary maps",
      value: formatTimestamp(zipBoundariesSyncedAt),
      startedAt: zipBoundariesSyncStartedAt,
      finishedAt: zipBoundariesSyncedAt,
      sortMs: timestampSortMs(zipBoundariesSyncedAt),
      detail:
        "Census TIGERweb ZCTA rings → Postgres (monthly; see Syncs overview)",
      actionId: "zip-boundaries",
      nextRunAt: nextRuns["zip-boundaries"],
    },
  ];
  rows.sort((a, b) => b.sortMs - a.sortMs);

  // Initial panel status — keeps the sync table fully populated on the first
  // render so there is no flash-of-empty between SSR and the first client poll.
  // rets / syncFailures are omitted here; they arrive via the first API poll.
  const initialStatus: PanelStatus = {
    refreshing: refresh.refreshing,
    lastRefreshFinished: refreshFinishedAt,
    lastRefreshStarted: lastRefreshStarted,
    latestListingUpdate: latestListingUpdate,
    lastIncrementalCronTick: lastIncrementalCronTick ?? null,
    propertyAddressesSyncedAt: propertyAddressesSyncedAt,
    zipBoundariesSyncedAt,
    zipBoundariesSyncStartedAt,
    stats: {
      total: stats.total,
      lastFullSync: stats.lastFullSync,
      lastFullSyncStarted: stats.lastFullSyncStarted,
      lastIncrementalSync: stats.lastIncrementalSync,
      lastIncrementalSyncStarted: stats.lastIncrementalSyncStarted,
      lastListingScores: stats.lastListingScores,
      lastListingScoresStarted: stats.lastListingScoresStarted,
      lastStatsCache: stats.lastStatsCache,
      lastStatsCacheStarted: stats.lastStatsCacheStarted,
      lastDealOfTheDayCache: stats.lastDealOfTheDayCache,
      lastDealOfTheDayCacheStarted: stats.lastDealOfTheDayCacheStarted,
    },
    nextRuns,
    nextOverrides,
    scheduleHints,
  };

  // Which Postgres this admin process is editing (Neon vs local). Site controls
  // always read/write this DATABASE_URL live — not a per-Lambda memory cache.
  const postgresTarget = describePostgresTarget()

  // Lambda instance metadata — secondary diagnostic only (warm container id).
  const lambdaUptimeSec = Math.round(process.uptime())
  const lambdaUptimeStr = (() => {
    if (lambdaUptimeSec < 60) return `${lambdaUptimeSec}s`
    if (lambdaUptimeSec < 3600) return `${Math.floor(lambdaUptimeSec / 60)}m ${lambdaUptimeSec % 60}s`
    const h = Math.floor(lambdaUptimeSec / 3600)
    const m = Math.floor((lambdaUptimeSec % 3600) / 60)
    return `${h}h ${m}m`
  })()
  const lambdaLogStream = process.env.AWS_LAMBDA_LOG_STREAM_NAME ?? null
  const lambdaInstanceId = lambdaLogStream
    ? (lambdaLogStream.split(']')[1]?.slice(0, 12) ?? null)
    : null
  const lambdaFnName = process.env.AWS_LAMBDA_FUNCTION_NAME ?? null

  const contactNotifyEmail = await safe(
    "contact-notify-email",
    () => getContactNotifyEmailFresh(),
    DEFAULT_CONTACT_NOTIFY_EMAIL,
  )
  const marketDigest = await safe(
    "market-digest",
    () => getMarketDigestConfigFresh(),
    {
      email: contactNotifyEmail,
      enabled: true,
      lastSentAt: null,
      lastWeekKey: null,
      defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    },
  )
  const deployNotify = await safe(
    "deploy-notify",
    () => getDeployNotifyConfigFresh(),
    null,
  )
  const socialProfiles = await safe(
    "social-profiles",
    () => getSocialProfilesFresh(),
    null,
  )
  const brokerageName = await safe(
    "brokerage-name",
    () => getBrokerageNameFresh(),
    DEFAULT_BROKERAGE_NAME,
  )
  const contactPhone = await safe(
    "contact-phone",
    () => getContactPhoneFresh(),
    {
      tel: DEFAULT_CONTACT_PHONE_DIGITS,
      display: formatPhoneDisplay(DEFAULT_CONTACT_PHONE_DIGITS),
    },
  )
  const photoTtlMinutes = await safe(
    "photo-ttl",
    () => getListingPhotoTtlMinutesFresh(),
    LISTING_PHOTO_TTL_MINUTES_DEFAULT,
  )
  const goldilocksConfig = await safe(
    "goldilocks-config",
    () => getGoldilocksConfigFresh(),
    DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  )
  const goldilocksNeedsRebuild = await safe(
    "goldilocks-needs-rebuild",
    () => goldilocksScoresNeedRebuild(goldilocksConfig),
    true,
  )
  const goldilocksInitial = {
    config: goldilocksConfig,
    default: DEFAULT_GOLDILOCKS_SCORING_CONFIG,
    isDefault: isDefaultGoldilocksConfig(goldilocksConfig),
    weightSum: goldilocksWeightSum(goldilocksConfig.weights),
    needsRebuild: goldilocksNeedsRebuild,
    meta: {
      factors: GOLDILOCKS_FACTOR_ORDER.map((key) => ({
        key,
        label: FACTOR_LABELS[key],
        description: FACTOR_DESCRIPTIONS[key],
      })),
      keywordGroups: GOLDILOCKS_KEYWORD_GROUP_ORDER.map((id) => ({
        id,
        label: GOLDILOCKS_KEYWORD_GROUP_LABELS[id],
        hint: GOLDILOCKS_KEYWORD_GROUP_HINTS[id],
      })),
    },
  }
  const pricingConfig = await safe(
    "pricing-matching-config",
    () => getPricingMatchingConfigFresh(),
    DEFAULT_PRICING_MATCHING_CONFIG,
  )
  const pricingInitial = {
    config: pricingConfig,
    default: DEFAULT_PRICING_MATCHING_CONFIG,
    isDefault: isDefaultPricingMatchingConfig(pricingConfig),
    meta: {
      fields: PRICING_MATCHING_FIELD_META,
      lookbackOptions: [...COMPARABLES_LOOKBACK_OPTIONS],
    },
  }

  const retsPanel = (
    <div id="admin-rets-credentials" className="scroll-mt-24">
      <AdminRetsCredentialsPanel />
    </div>
  );

  const postgresPanel = (
    <div id="admin-sqlite-schemas" className="scroll-mt-24">
      <AdminSqliteDiagrams
        databases={sqliteDiagrams}
        blobRuntime={photosOnR2 ? undefined : blobRuntime}
      />
    </div>
  );

  const dbPanel = (
    <AdminDatabasePanel
      retsConnection={
        <AdminRetsConnectionPanel initial={initialStatus.rets ?? null} />
      }
      inventory={
        <>
          <AdminInventoryComparisonPanel
            initialSnapshot={inventorySnapshot}
          />
          <AdminDatabaseInventoryPanel initial={databaseStats} />
        </>
      }
      townCounts={
        <div
          id="admin-town-counts"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
        >
          <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              Active listings by town
            </p>
          </div>
          {Object.keys(stats.byTown).length > 0 ? (
            <ul className="divide-y divide-charcoal/[0.08]">
              {Object.entries(stats.byTown)
                .sort((a, b) => b[1] - a[1])
                .map(([town, count]) => (
                  <li
                    key={town}
                    className="flex items-baseline justify-between gap-4 px-5 sm:px-6 py-3"
                  >
                    <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/55">
                      {town}
                    </span>
                    <span className="font-mono tabular-nums text-navy font-semibold">
                      {count.toLocaleString()}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="px-5 sm:px-6 py-6 text-sm text-charcoal/55">
              No active listing counts yet — run a sync to populate town inventory.
            </p>
          )}
        </div>
      }
    />
  );

  const dbTuningPanel = (
    <AdminDbTuningPanel
      initial={{
        chunkRows: getUpsertChunkRows(),
        default: DB_UPSERT_CHUNK_ROWS_DEFAULT,
        min: DB_UPSERT_CHUNK_ROWS_MIN,
        max: DB_UPSERT_CHUNK_ROWS_MAX,
        activeFetchLimit: getActiveListingsFetchLimit(),
        activeFetchDefault: ACTIVE_LISTINGS_FETCH_LIMIT,
        activeFetchMin: ACTIVE_LISTINGS_FETCH_LIMIT_MIN,
        activeFetchMax: ACTIVE_LISTINGS_FETCH_LIMIT_MAX,
        closedFetchLimit: CLOSED_LISTINGS_FETCH_LIMIT,
        expiredFetchLimit: EXPIRED_LISTINGS_FETCH_LIMIT,
      }}
    />
  );

  const sitePanel = (
    <>
      <AdminPhotoHealthPanel />

      <AdminPhotoTtlPanel
        initial={{
          ttlMinutes: photoTtlMinutes,
          default: LISTING_PHOTO_TTL_MINUTES_DEFAULT,
          min: LISTING_PHOTO_TTL_MINUTES_MIN,
          max: LISTING_PHOTO_TTL_MINUTES_MAX,
        }}
      />

      <AdminBrokeragePanel
        initial={{
          name: brokerageName,
          default: DEFAULT_BROKERAGE_NAME,
        }}
      />

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <AdminContactEmailPanel
          initial={{
            email: contactNotifyEmail,
            default: DEFAULT_CONTACT_NOTIFY_EMAIL,
          }}
        />

        <AdminContactPhonePanel
          initial={{
            phone: contactPhone.tel,
            display: contactPhone.display,
            default: DEFAULT_CONTACT_PHONE_DIGITS,
            defaultDisplay: formatPhoneDisplay(DEFAULT_CONTACT_PHONE_DIGITS),
          }}
        />
      </div>

      <AdminDeployNotifyPanel initial={deployNotify ?? undefined} />
    </>
  );

  const communicationsPanel = (
    <AdminCommunicationsPanel
      marketDigest={<AdminMarketDigestPanel initial={marketDigest} />}
      socialProfiles={
        <AdminSocialProfilesPanel initial={socialProfiles ?? undefined} />
      }
    />
  );

  const inventoryBandsPanel = <AdminInventorySegmentBandsPanel />;

  const dataControlsPanel = (
    <AdminDataControlsPanel
      site={sitePanel}
      spotlight={<AdminSpotlightSitePanel />}
      goldilocks={<AdminGoldilocksPanel initial={goldilocksInitial} />}
      pricing={<AdminPricingPanel initial={pricingInitial} />}
      vintages={<AdminVintagesPanel />}
      rets={retsPanel}
      intelInventory={inventoryBandsPanel}
    />
  );

  const syncsPanel = (
    <AdminSyncsPanel
      syncRows={rows}
      initialRefreshing={refresh.refreshing}
      initialStatus={initialStatus}
      initialPausedJobs={scheduledSyncPausedJobs}
      storeLabel={postgresTarget.shortLabel}
      storeLabelClassName={
        postgresTarget.isProductionStore
          ? "text-sage"
          : postgresTarget.kind === "local"
            ? "text-coral"
            : "text-charcoal/55"
      }
      lambdaLine={
        lambdaInstanceId || lambdaFnName
          ? `Lambda up ${lambdaUptimeStr}${
              lambdaInstanceId ? ` · ${lambdaInstanceId}…` : ""
            }`
          : null
      }
      history={
        <>
          <AdminSyncHistoryPanel initial={syncRunHistory} />
          <AdminSyncRunLog />
        </>
      }
      overview={
        <AdminSyncsOverviewPanel
          startupLanes={startupProcess.lanes}
          startupContext={startupProcess.context}
          pausedJobs={scheduledSyncPausedJobs}
          zipInventory={zipInventory}
          zipLastSyncAt={zipBoundariesSyncedAt}
          zipLastSyncStartedAt={zipBoundariesSyncStartedAt}
          zipNextRunAt={nextRuns["zip-boundaries"]}
          lastIncrementalCronTick={lastIncrementalCronTick ?? null}
        />
      }
      dbTuning={dbTuningPanel}
    />
  );

  const serverPanel = <AdminServerFunctionsPanel />;

  const deployBuild = readDeployBuildInfo();

  const statusBar = (
    <div
      className={`rounded-xl border px-4 py-3 sm:px-5 ${
        postgresTarget.isProductionStore
          ? "border-sage/25 bg-sage/[0.08]"
          : postgresTarget.kind === "local"
            ? "border-coral/25 bg-coral/[0.08]"
            : "border-charcoal/[0.1] bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 min-w-0">
        <div className="min-w-0 select-none">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-charcoal/40 leading-none mb-1">
            Build and host info
          </p>
          {deployBuild ? (
            <>
              {deployBuild.builtAtDisplayLines.map((line, i) => (
                <p
                  key={line}
                  className={`font-mono text-[10px] leading-snug whitespace-nowrap ${
                    i === 0 ? "text-charcoal/75" : "text-charcoal/55 mt-0.5"
                  }`}
                >
                  {line}
                </p>
              ))}
              <p className="font-mono text-[9px] text-charcoal/40 leading-none mt-1">
                #{deployBuild.shortId}
                {deployBuild.id.length > 12 ? "…" : ""}
              </p>
            </>
          ) : (
            <p className="font-mono text-[10px] text-charcoal/40 leading-snug">
              unavailable · next Netlify deploy stamps it
            </p>
          )}
          {postgresTarget.host ? (
            <p className="font-mono text-[9px] text-charcoal/40 leading-none mt-1 truncate max-w-[18rem]">
              {postgresTarget.host}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-charcoal/40 leading-none mb-1">
            Database
          </p>
          <p
            className={`font-mono text-[11px] leading-snug ${
              postgresTarget.isProductionStore
                ? "text-sage"
                : postgresTarget.kind === "local"
                  ? "text-coral"
                  : "text-charcoal/80"
            }`}
          >
            {postgresTarget.editingLabel}
          </p>
        </div>
        {(lambdaInstanceId || lambdaFnName) && (
          <div className="min-w-0">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-charcoal/40 leading-none mb-1">
              Lambda
            </p>
            {lambdaInstanceId ? (
              <p className="font-mono text-[10px] text-charcoal/55 leading-snug">
                {lambdaInstanceId}&hellip;
              </p>
            ) : null}
            <p className="font-mono text-[10px] text-charcoal/45 leading-snug mt-0.5">
              up {lambdaUptimeStr}
              {lambdaFnName ? ` · ${lambdaFnName}` : ""}
            </p>
          </div>
        )}
      </div>
      {postgresTarget.detail ? (
        <p className="mt-2 text-xs text-charcoal/55 leading-snug max-w-3xl">
          {postgresTarget.detail}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Explore
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Admin{" "}
            <span className="italic gold-shimmer">status.</span>
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            Database sync, web server schedules, product pages, and site controls — use
            the tabs below or jump links to navigate.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs animate-fade-up-delay-2">
            <span className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  refresh.refreshing
                    ? "bg-gold animate-pulse-dot"
                    : listingsDbEmpty
                      ? "bg-coral animate-pulse-dot"
                      : "bg-sage"
                }`}
              />
              <span
                className={
                  listingsDbEmpty ? "text-coral font-semibold" : "text-white/50"
                }
              >
                {refresh.refreshing
                  ? "Refresh in progress"
                  : listingsDbEmpty
                    ? "⚠ 0 listings — run Full resync"
                    : `${stats.total.toLocaleString()} listings in Postgres`}
              </span>
            </span>
          </div>
        </div>
      </section>

      {loadErrors.length > 0 && (
        <div className="border-b border-coral/30 bg-coral/[0.09] px-6 py-4">
          <div className="mx-auto max-w-7xl lg:px-4">
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-coral font-semibold mb-2">
              ⚠ Admin rendered in degraded mode — {loadErrors.length} read
              {loadErrors.length === 1 ? "" : "s"} failed
            </p>
            <ul className="space-y-1">
              {loadErrors.map((entry, i) => (
                <li
                  key={i}
                  className="font-mono text-[11px] text-charcoal/70 break-words"
                >
                  {entry}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-charcoal/55 max-w-3xl leading-snug">
              The page loaded with fallbacks so it stays diagnosable. If these
              errors mention a Neon <strong>data-transfer quota</strong>,
              production database reads are being rejected until the quota
              resets (or you move off the free tier) — no code change will
              restore data until then.
            </p>
          </div>
        </div>
      )}

      {listingsDbEmpty && (
        <div className="border-b border-coral/20 bg-coral/[0.07] px-6 py-4">
          <div className="mx-auto max-w-7xl lg:px-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-coral text-lg leading-none" aria-hidden>⚠</span>
              <div>
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-coral font-semibold mb-1">
                  Listing database is empty
                </p>
                <p className="text-sm text-charcoal/70 leading-snug max-w-3xl">
                  Neon Postgres has 0 listings — run a <strong>Full Resync</strong> (step 1 in the
                  Database sync panel) or wait for the scheduled sync to pull MLS data.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  <span className="font-mono text-[10px] text-charcoal/50">
                    <span className="text-charcoal/30 uppercase tracking-wide mr-1">Lambda uptime</span>
                    {lambdaUptimeStr}
                    {lambdaInstanceId && (
                      <span className="ml-2 text-charcoal/30">id: {lambdaInstanceId}…</span>
                    )}
                  </span>
                  {lambdaFnName && (
                    <span className="font-mono text-[10px] text-charcoal/40">
                      <span className="text-charcoal/30 uppercase tracking-wide mr-1">fn</span>
                      {lambdaFnName}
                    </span>
                  )}
                  {!photosOnR2 && blobRuntime.lastRestoreAt && (
                    <span className="font-mono text-[10px] text-charcoal/50">
                      <span className="text-charcoal/30 uppercase tracking-wide mr-1">Last photos blob restore</span>
                      {blobRuntime.lastRestoreAt}
                    </span>
                  )}
                  {!photosOnR2 && blobRuntime.lastPersistAt && (
                    <span className="font-mono text-[10px] text-charcoal/50">
                      <span className="text-charcoal/30 uppercase tracking-wide mr-1">Last photos checkpoint</span>
                      {blobRuntime.lastPersistAt}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AdminTabbedLayout
        statusBar={statusBar}
        db={dbPanel}
        postgres={postgresPanel}
        stats={<AdminStatsInventoryPanel />}
        dataControls={dataControlsPanel}
        communications={communicationsPanel}
        cookies={<AdminBrowserCookiesPanel />}
        architecture={
          <AdminArchitecturePanel
            map={<AdminSiteArchitecturePanel />}
            docs={<AdminProductDocsPanel />}
          />
        }
        syncs={syncsPanel}
        server={serverPanel}
        glossary={<AdminGlossaryPanel />}
      />
    </>
  );
}
