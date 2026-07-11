import { cookies } from "next/headers";
import AdminHeroNav from "@/components/admin/AdminHeroNav";
import AdminProductDocsPanel from "@/components/admin/AdminProductDocsPanel";
import AdminRefreshLockPanel from "@/components/admin/AdminRefreshLockPanel";
import AdminRetsCredentialsPanel from "@/components/admin/AdminRetsCredentialsPanel";
import AdminServerFunctionsPanel from "@/components/admin/AdminServerFunctionsPanel";
import AdminSpotlightSitePanel from "@/components/admin/AdminSpotlightSitePanel";
import AdminSqliteDiagrams from "@/components/admin/AdminSqliteDiagrams";
import AdminStartupDiagram from "@/components/admin/AdminStartupDiagram";
import AdminSyncTable, { type AdminSyncRow } from "@/components/admin/AdminSyncTable";
import AdminTabbedLayout from "@/components/admin/AdminTabbedLayout";
import SitePasswordGate from "@/components/SitePasswordGate";
import {
  describeListingsDbRuntime,
  getListingsDbStats,
  getSyncMeta,
  readLatestListingModificationTimestamp,
} from "@/lib/listings-db";
import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { mlsTimestampDate } from "@/lib/mls-time";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import { describeRunningSqliteDatabases } from "@/lib/sqlite-schema-diagram";
import { describeStartupProcess } from "@/lib/startup-process";
import { readAdminSyncPanelStatus } from "@/lib/admin-sync-actions";
import { readSqliteRefreshLockStatus, readRefreshLockHistorySummary } from "@/lib/sqlite-refresh-status";

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

  const stats = getListingsDbStats();
  const { refresh, nextRuns } = readAdminSyncPanelStatus();
  const refreshLock = readSqliteRefreshLockStatus();
  const refreshLockHistory = readRefreshLockHistorySummary();
  const latestListingUpdate = readLatestListingModificationTimestamp();
  const lastRefreshFinished = getSyncMeta("last_refresh_finished_at");
  const lastRefreshStarted = getSyncMeta("last_refresh_started_at");
  const propertyAddressesSyncedAt = getSyncMeta("property_addresses_synced_at");
  const refreshFinishedAt = lastRefreshFinished ?? refresh.lastFinishedAt;
  const sqliteDiagrams = describeRunningSqliteDatabases();
  const listingsDbRuntime = describeListingsDbRuntime();
  const startupProcess = describeStartupProcess();

  const rows: StatusRow[] = [
    {
      id: "full-resync",
      label: "Full resync",
      value: formatTimestamp(stats.lastFullSync),
      startedAt: stats.lastFullSyncStarted,
      finishedAt: stats.lastFullSync,
      sortMs: timestampSortMs(stats.lastFullSync),
      detail: "Complete MLS → SQLite reload (scheduled daily at 5am ET)",
      actionId: "full-resync",
      nextRunAt: nextRuns["full-resync"],
    },
    {
      id: "incremental",
      label: "Incremental update",
      value: formatTimestamp(stats.lastIncrementalSync),
      startedAt: stats.lastIncrementalSyncStarted,
      finishedAt: stats.lastIncrementalSync,
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
      detail: "Newest ModificationTimestamp among Active listings in SQLite",
      nextRunAt: nextRuns["latest-mls"],
    },
    {
      id: "listing-scores",
      label: "Goldilocks score rebuild",
      value: formatTimestamp(stats.lastListingScores),
      startedAt: stats.lastListingScoresStarted,
      finishedAt: stats.lastListingScores,
      sortMs: timestampSortMs(stats.lastListingScores),
      detail: "Scores written during the daily full reload",
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
      detail: refresh.refreshing ? "A refresh is currently in progress" : "Publish read snapshot to listings.read.db",
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

  const dbPanel = (
    <>
      <div id="admin-rets-credentials" className="scroll-mt-24">
        <AdminRetsCredentialsPanel />
      </div>

      <div
        id="admin-sync"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Database sync
          </p>
        </div>
        <AdminSyncTable rows={rows} initialRefreshing={refresh.refreshing} />
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
        {!listingsDbRuntime.nativeModuleAvailable || stats.total === 0 ? (
          <div className="mb-4 rounded-2xl border border-coral/25 bg-coral/[0.06] px-5 sm:px-6 py-4">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-coral mb-2">
              Listings DB runtime
            </p>
            <dl className="font-mono text-[11px] text-charcoal/70 space-y-1">
              <div>
                <dt className="inline text-charcoal/45">cwd: </dt>
                <dd className="inline break-all">{listingsDbRuntime.cwd}</dd>
              </div>
              <div>
                <dt className="inline text-charcoal/45">write: </dt>
                <dd className="inline break-all">{listingsDbRuntime.writePath}</dd>
              </div>
              {listingsDbRuntime.nativeModuleError ? (
                <div>
                  <dt className="inline text-charcoal/45">native: </dt>
                  <dd className="inline break-all">{listingsDbRuntime.nativeModuleError}</dd>
                </div>
              ) : null}
              {listingsDbRuntime.lastOpenError ? (
                <div>
                  <dt className="inline text-charcoal/45">open: </dt>
                  <dd className="inline break-all">{listingsDbRuntime.lastOpenError}</dd>
                </div>
              ) : null}
              {listingsDbRuntime.bundleSources.map((src) => (
                <div key={src.path}>
                  <dt className="inline text-charcoal/45">bundle: </dt>
                  <dd className="inline break-all">
                    {src.path}
                    {src.exists ? ` (${src.bytes?.toLocaleString() ?? "?"} bytes)` : " (missing)"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <AdminSqliteDiagrams databases={sqliteDiagrams} />
      </div>
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
            SQLite sync, web server schedules, product pages, and spotlight controls — use
            the tabs below or jump links to navigate.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs animate-fade-up-delay-2">
            <span className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  refresh.refreshing ? "bg-gold animate-pulse-dot" : "bg-sage"
                }`}
              />
              <span className="text-white/50">
                {refresh.refreshing
                  ? "Refresh in progress"
                  : `${stats.total.toLocaleString()} listings in SQLite`}
              </span>
            </span>
          </div>
          <AdminHeroNav />
        </div>
      </section>

      <AdminTabbedLayout
        db={dbPanel}
        server={serverPanel}
        docs={<AdminProductDocsPanel />}
        site={<AdminSpotlightSitePanel />}
      />
    </>
  );
}
