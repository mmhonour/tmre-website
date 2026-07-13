import { cookies } from "next/headers";
import AdminHeroNav from "@/components/admin/AdminHeroNav";
import AdminProductDocsPanel from "@/components/admin/AdminProductDocsPanel";
import AdminRefreshLockPanel from "@/components/admin/AdminRefreshLockPanel";
import AdminRetsCredentialsPanel from "@/components/admin/AdminRetsCredentialsPanel";
import AdminServerFunctionsPanel from "@/components/admin/AdminServerFunctionsPanel";
import AdminSpotlightSitePanel from "@/components/admin/AdminSpotlightSitePanel";
import AdminSqliteDiagrams from "@/components/admin/AdminSqliteDiagrams";
import AdminSyncRunLog from "@/components/admin/AdminSyncRunLog";
import AdminDbTuningPanel from "@/components/admin/AdminDbTuningPanel";
import AdminPhotoTtlPanel from "@/components/admin/AdminPhotoTtlPanel";
import AdminScheduledSyncPanel from "@/components/admin/AdminScheduledSyncPanel";
import { isScheduledSyncPausedFresh } from "@/lib/scheduled-sync-toggle";
import {
  DB_UPSERT_CHUNK_ROWS_DEFAULT,
  DB_UPSERT_CHUNK_ROWS_MAX,
  DB_UPSERT_CHUNK_ROWS_MIN,
  getUpsertChunkRows,
} from "@/lib/db/db-write-tuning";
import {
  getListingPhotoTtlMinutes,
  LISTING_PHOTO_TTL_MINUTES_DEFAULT,
  LISTING_PHOTO_TTL_MINUTES_MAX,
  LISTING_PHOTO_TTL_MINUTES_MIN,
} from "@/lib/listing-photo-ttl-config";
import AdminStartupDiagram from "@/components/admin/AdminStartupDiagram";
import AdminSyncTable, { type AdminSyncRow, type PanelStatus } from "@/components/admin/AdminSyncTable";
import AdminTabbedLayout from "@/components/admin/AdminTabbedLayout";
import SitePasswordGate from "@/components/SitePasswordGate";
import {
  readInventorySnapshot,
  readLatestListingModificationTimestamp,
  readListingsDbStats,
  type InventorySnapshot,
} from "@/lib/db/listings-repo";
import { getSyncMeta } from "@/lib/db/sync-meta-store";
import {
  describePhotosBlobPersistRuntime,
  ensureAdminListingPhotosReady,
  readRefreshLockHistoryFromBlob,
} from "@/lib/listing-photos-db-persist";
import { ensurePostDeployFullResyncScheduled } from "@/lib/deploy-full-resync-schedule";
import { formatAdminNextSyncCountdown } from "@/lib/admin-sync-schedule-format";
import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { mlsTimestampDate } from "@/lib/mls-time";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import { describePostgresDatabase } from "@/lib/postgres-schema-diagram";
import { describeRunningSqliteDatabases } from "@/lib/sqlite-schema-diagram";
import { describeStartupProcess } from "@/lib/startup-process";
import { readAdminSyncPanelStatus } from "@/lib/admin-sync-actions";
import { collectAdminDatabaseSyncStats } from "@/lib/sqlite-sync-stats";
import {
  buildRefreshLockHistorySummary,
  readSqliteRefreshLockStatus,
  readRefreshLockHistorySummary,
  type RefreshLockHistoryEntry,
} from "@/lib/sqlite-refresh-status";

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
  const scheduledSyncPaused = await safe(
    "scheduled-sync-flag",
    () => isScheduledSyncPausedFresh(),
    false,
  );
  await safe(
    "post-deploy-schedule",
    async () => {
      await ensurePostDeployFullResyncScheduled();
      return null;
    },
    null,
  );

  const stats = await readListingsDbStats();
  const { refresh, nextRuns, scheduleHints } = await readAdminSyncPanelStatus();
  const refreshLock = readSqliteRefreshLockStatus();
  const _primaryHistory = readRefreshLockHistorySummary();
  const refreshLockHistory = await (async () => {
    if (_primaryHistory.entries.length > 0) return _primaryHistory;
    const blobRaw = await safe(
      "refresh-lock-history-blob",
      () => readRefreshLockHistoryFromBlob(),
      null as Awaited<ReturnType<typeof readRefreshLockHistoryFromBlob>> | null,
    );
    if (!blobRaw || blobRaw.length === 0) return _primaryHistory;
    const blobEntries = blobRaw.filter(
      (v): v is RefreshLockHistoryEntry =>
        v != null &&
        typeof v === "object" &&
        typeof (v as RefreshLockHistoryEntry).id === "string" &&
        typeof (v as RefreshLockHistoryEntry).startedAt === "string" &&
        Array.isArray((v as RefreshLockHistoryEntry).tables),
    );
    return blobEntries.length > 0
      ? buildRefreshLockHistorySummary(blobEntries)
      : _primaryHistory;
  })();
  const latestListingUpdate = await safe(
    "latest-mls-timestamp",
    () => readLatestListingModificationTimestamp(),
    null,
  );
  const lastRefreshFinished = getSyncMeta("last_refresh_finished_at");
  const lastRefreshStarted = getSyncMeta("last_refresh_started_at");
  const propertyAddressesSyncedAt = getSyncMeta("property_addresses_synced_at");
  const refreshFinishedAt = lastRefreshFinished ?? refresh.lastFinishedAt;
  const postgresDiagram = await describePostgresDatabase();
  const sqliteDiagrams = [postgresDiagram, ...describeRunningSqliteDatabases()];
  const databaseStats = await safe(
    "database-sync-stats",
    () => collectAdminDatabaseSyncStats(),
    [],
  );
  const blobRuntime = await safe("photos-blob-runtime", () => describePhotosBlobPersistRuntime(), {
    active: false,
    mode: "local-file" as const,
    reason: "unavailable — read failed",
    lastPersistAt: null,
    lastPersistResult: null,
    lastRestoreAt: null,
  });
  const inventorySnapshot = await readInventorySnapshot();
  const listingsDbEmpty = stats.total === 0;
  const showListingsDbRuntime = listingsDbEmpty;
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
      detail: `Modified-since RETS pull (every ${Math.round(LATEST_DB_REFRESH_MS / 60_000)} minutes)`,
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
    propertyAddressesSyncedAt: propertyAddressesSyncedAt,
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
    scheduleHints,
    databaseStats,
  };

  // Lambda instance metadata — available at runtime on Netlify serverless.
  // process.uptime() = seconds since this Node.js process (Lambda) started.
  // AWS_LAMBDA_LOG_STREAM_NAME = "2024/01/01/[$LATEST]<16-hex-chars>" — the hex
  // suffix is a unique identifier for this Lambda container instance.
  // Computed here (rather than closer to the hero section below) so both the
  // hero banner AND the Database sync panel header can reference it.
  const lambdaUptimeSec = Math.round(process.uptime())
  const lambdaUptimeStr = (() => {
    if (lambdaUptimeSec < 60) return `${lambdaUptimeSec}s`
    if (lambdaUptimeSec < 3600) return `${Math.floor(lambdaUptimeSec / 60)}m ${lambdaUptimeSec % 60}s`
    const h = Math.floor(lambdaUptimeSec / 3600)
    const m = Math.floor((lambdaUptimeSec % 3600) / 60)
    return `${h}h ${m}m`
  })()
  // Extract the instance hex suffix from the log stream name (last 12 chars of hex ID).
  const lambdaLogStream = process.env.AWS_LAMBDA_LOG_STREAM_NAME ?? null
  const lambdaInstanceId = lambdaLogStream
    ? (lambdaLogStream.split(']')[1]?.slice(0, 12) ?? null)
    : null
  const lambdaFnName = process.env.AWS_LAMBDA_FUNCTION_NAME ?? null

  const retsPanel = (
    <div id="admin-rets-credentials" className="scroll-mt-24">
      <AdminRetsCredentialsPanel />
    </div>
  );

  const dbPanel = (
    <>
      <div
        id="admin-sync"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex items-baseline justify-between gap-4">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Database sync
          </p>
          {(lambdaInstanceId || lambdaFnName) && (
            <p className="font-mono text-[10px] tracking-[0.08em] text-charcoal/40 text-right leading-tight">
              <span className="uppercase tracking-[0.18em] text-charcoal/30 mr-1">Lambda</span>
              {lambdaInstanceId && <span>{lambdaInstanceId}&hellip;</span>}
              {lambdaFnName && (
                <span className="block text-charcoal/30 truncate max-w-[16rem]">{lambdaFnName}</span>
              )}
              <span className="block text-charcoal/30">up {lambdaUptimeStr}</span>
            </p>
          )}
        </div>
        <AdminSyncTable
          rows={rows}
          initialRefreshing={refresh.refreshing}
          initialDatabaseStats={databaseStats}
          initialStatus={initialStatus}
        />
      </div>

      <div id="admin-refresh-lock" className="scroll-mt-24">
        <AdminRefreshLockPanel initialLock={refreshLock} initialHistory={refreshLockHistory} />
      </div>

      {Object.keys(stats.byTown).length > 0 ? (
        <div
          id="admin-town-counts"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
        >
          <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              Active listings by town
            </p>
          </div>
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
        </div>
      ) : null}

      <div id="admin-sqlite-schemas" className="scroll-mt-24">
        {showListingsDbRuntime ? (
          <div className="mb-4 rounded-2xl border border-gold/25 bg-gold/[0.06] px-5 sm:px-6 py-4">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase mb-2 text-gold">
              Postgres listings inventory
            </p>
            <p className="text-sm text-slate leading-snug mb-3">
              Neon Postgres has <strong>{stats.total.toLocaleString()}</strong> listings. Run{" "}
              <strong>step 1 Full resync</strong>
              {scheduleHints.fullResyncSource === "post-deploy" && nextRuns["full-resync"] ? (
                <>
                  {" "}
                  or wait for the post-deploy warm in{" "}
                  <strong>
                    {formatAdminNextSyncCountdown(nextRuns["full-resync"], new Date())}
                  </strong>
                </>
              ) : (
                <> or wait for the startup / scheduled sync</>
              )}{" "}
              to pull MLS data.
            </p>
          </div>
        ) : null}
        <AdminSqliteDiagrams databases={sqliteDiagrams} blobRuntime={blobRuntime} inventorySnapshot={inventorySnapshot} />
      </div>

      <AdminScheduledSyncPanel initialPaused={scheduledSyncPaused} />

      <AdminDbTuningPanel
        initial={{
          chunkRows: getUpsertChunkRows(),
          default: DB_UPSERT_CHUNK_ROWS_DEFAULT,
          min: DB_UPSERT_CHUNK_ROWS_MIN,
          max: DB_UPSERT_CHUNK_ROWS_MAX,
        }}
      />

      <AdminPhotoTtlPanel
        initial={{
          ttlMinutes: getListingPhotoTtlMinutes(),
          default: LISTING_PHOTO_TTL_MINUTES_DEFAULT,
          min: LISTING_PHOTO_TTL_MINUTES_MIN,
          max: LISTING_PHOTO_TTL_MINUTES_MAX,
        }}
      />

      <AdminSyncRunLog />
    </>
  );

  const serverPanel = (
    <>
      <div id="admin-startup" className="scroll-mt-24">
        <AdminStartupDiagram
          lanes={startupProcess.lanes}
          context={startupProcess.context}
        />
      </div>
      <AdminServerFunctionsPanel />
    </>
  );

  const deployId = process.env.DEPLOY_ID ?? null
  const deployBuildTime: Date | null = (() => {
    if (!deployId || deployId.length < 8) return null
    const ts = parseInt(deployId.substring(0, 8), 16)
    if (!Number.isFinite(ts) || ts <= 0) return null
    return new Date(ts * 1000)
  })()
  const deployBuildTimeStr = deployBuildTime
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(deployBuildTime)
    : null

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="absolute top-5 right-6 lg:top-8 lg:right-10 text-right pointer-events-none select-none space-y-1">
            {deployId && (
              <div>
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-white/35 leading-none mb-0.5">
                  Deploy
                </p>
                <p className="font-mono text-[10px] text-white/55 leading-none">
                  {deployId.substring(0, 12)}&hellip;
                </p>
                {deployBuildTimeStr && (
                  <p className="font-mono text-[9px] text-white/35 leading-none mt-0.5">
                    {deployBuildTimeStr}
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-white/35 leading-none mb-0.5">
                Lambda
              </p>
              {lambdaInstanceId && (
                <p className="font-mono text-[10px] text-white/55 leading-none">
                  {lambdaInstanceId}&hellip;
                </p>
              )}
              {lambdaFnName && (
                <p className="font-mono text-[9px] text-white/30 leading-none mt-0.5 truncate max-w-[14rem]">
                  {lambdaFnName}
                </p>
              )}
              <p className="font-mono text-[9px] text-white/35 leading-none mt-0.5">
                up {lambdaUptimeStr}
              </p>
            </div>
          </div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Explore
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Admin{" "}
            <span className="italic gold-shimmer">status.</span>
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            Database sync, web server schedules, product pages, and spotlight controls — use
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
          <AdminHeroNav />
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
                  {blobRuntime.lastRestoreAt && (
                    <span className="font-mono text-[10px] text-charcoal/50">
                      <span className="text-charcoal/30 uppercase tracking-wide mr-1">Last photos blob restore</span>
                      {blobRuntime.lastRestoreAt}
                    </span>
                  )}
                  {blobRuntime.lastPersistAt && (
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
        db={dbPanel}
        server={serverPanel}
        docs={<AdminProductDocsPanel />}
        site={<AdminSpotlightSitePanel />}
        rets={retsPanel}
      />
    </>
  );
}
