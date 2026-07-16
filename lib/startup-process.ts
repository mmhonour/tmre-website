import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { postDeployDelayLabel } from "@/lib/deploy-full-resync-schedule";

export type StartupStepStatus = "active" | "scheduled" | "skipped" | "info";

export type StartupFlowStep = {
  id: string;
  title: string;
  timing: string;
  detail: string;
  status: StartupStepStatus;
  statusLabel: string;
};

export type StartupFlowLane = {
  id: string;
  title: string;
  subtitle: string;
  steps: StartupFlowStep[];
};

function envFlagEnabled(name: string, defaultEnabled = true): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultEnabled;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

/**
 * Describe the Node startup schedule from instrumentation.ts, including which
 * lanes are active in this process (local:dev / next:start / Netlify).
 */
export function describeStartupProcess(): {
  context: {
    runtime: string;
    retsConfigured: boolean;
    netlify: boolean;
    nodeEnv: string;
  };
  lanes: StartupFlowLane[];
} {
  const retsConfigured = Boolean(
    process.env.RETS_SERVER_URL &&
      process.env.RETS_USERNAME &&
      process.env.RETS_PASSWORD,
  );
  const netlify = process.env.NETLIFY === "true";
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const allowListingsSync =
    process.env.ENABLE_BACKGROUND_SQLITE_REFRESH === "1" ||
    netlify ||
    nodeEnv === "production";

  const startupDelayMs = Math.max(
    2_000,
    Number(process.env.STARTUP_FULL_SYNC_DELAY_MS ?? "8000"),
  );
  const latestIntervalMs = Math.max(
    60_000,
    Number(process.env.LATEST_SYNC_INTERVAL_MS ?? String(LATEST_DB_REFRESH_MS)),
  );
  const overdueCatchupEnabled = envFlagEnabled('ENABLE_OVERDUE_SYNC_CATCHUP')
  const overdueCatchupDelayMs = Math.max(
    60_000,
    Number(process.env.OVERDUE_SYNC_CATCHUP_DELAY_MS ?? '120000'),
  )
  const startupFullEnabled =
    envFlagEnabled('ENABLE_STARTUP_FULL_SYNC') && retsConfigured && !netlify && !overdueCatchupEnabled
  const latestSyncEnabled =
    envFlagEnabled("ENABLE_LATEST_SYNC") && (allowListingsSync || retsConfigured);
  const fullReloadEnabled =
    envFlagEnabled("ENABLE_DAILY_FULL_SYNC") && (allowListingsSync || retsConfigured);
  const propertyAddressSyncEnabled =
    envFlagEnabled("ENABLE_PROPERTY_ADDRESS_SYNC") && allowListingsSync;
  const edgeScoreRebuildEnabled =
    envFlagEnabled("ENABLE_EDGE_SCORE_REBUILD") && allowListingsSync;
  const listingsIntervalMs = Number(process.env.LISTINGS_SYNC_INTERVAL_MS ?? "0");
  const smartIntervalEnabled =
    allowListingsSync &&
    Number.isFinite(listingsIntervalMs) &&
    listingsIntervalMs >= 60_000;
  const netlifyWarmEnabled = allowListingsSync && netlify && !smartIntervalEnabled;

  const lanes: StartupFlowLane[] = [
    {
      id: "overdue-catchup",
      title: "Missed sync catch-up",
      subtitle: "Serial overdue jobs after host wakeup (local / Netlify process start)",
      steps: [
        {
          id: "overdue-schedule",
          title: "Detect overdue admin sync windows",
          timing: `+${Math.round(overdueCatchupDelayMs / 1000)}s`,
          detail:
            "buildOverdueSyncPlan(): full resync, incremental, scores, stats, DOTD, snapshot, addresses, edge scores — one run each, not every missed interval.",
          status: overdueCatchupEnabled ? "scheduled" : "skipped",
          statusLabel: overdueCatchupEnabled ? "Scheduled" : "Disabled",
        },
        {
          id: "overdue-run",
          title: "Serial catch-up execution",
          timing: "after delay",
          detail:
            "runOverdueSyncCatchup() uses sync_meta timestamps; skips when nothing is due. Netlify scheduled functions also invoke catch-up at cron start.",
          status: overdueCatchupEnabled ? "scheduled" : "skipped",
          statusLabel: overdueCatchupEnabled ? "Chained" : "—",
        },
      ],
    },
    {
      id: "boot",
      title: "Process boot",
      subtitle: "instrumentation.register() on Node runtime",
      steps: [
        {
          id: "boot-register",
          title: "Next.js Node register",
          timing: "t = 0",
          detail: "Loads listings-sync, stats-cache, sync_meta hydrate, and listing-photos SQLite helpers.",
          status: "active",
          statusLabel: "Always",
        },
        {
          id: "boot-rets",
          title: "RETS credentials",
          timing: "gate",
          detail: retsConfigured
            ? "RETS_SERVER_URL / USERNAME / PASSWORD present."
            : "Missing RETS_* — sync lanes stay idle.",
          status: retsConfigured ? "active" : "skipped",
          statusLabel: retsConfigured ? "Configured" : "Missing",
        },
      ],
    },
    {
      id: "startup-full",
      title: "Startup full reload",
      subtitle: "Local:dev / next:start only — skipped on Netlify cold starts",
      steps: [
        {
          id: "startup-full-schedule",
          title: "Schedule full MLS → Postgres",
          timing: `+${Math.round(startupDelayMs / 1000)}s`,
          detail:
            "syncAllTownListings(): Active → Closed → Expired for every TMRE town.",
          status: startupFullEnabled ? "scheduled" : "skipped",
          statusLabel: startupFullEnabled
            ? "Scheduled"
            : overdueCatchupEnabled
              ? "Uses overdue catch-up"
              : netlify
                ? "Netlify uses build sync"
                : "Disabled",
        },
        {
          id: "startup-full-scores",
          title: "Goldilocks score rebuild",
          timing: "after towns sync",
          detail: "Scores every Active listing; writes last_listing_scores.",
          status: startupFullEnabled ? "scheduled" : "skipped",
          statusLabel: startupFullEnabled ? "Chained" : "—",
        },
        {
          id: "startup-full-superlatives",
          title: "Listing superlatives rebuild",
          timing: "after scores",
          detail:
            "Peer-relative tags per Active listing (zip/town peers); writes listing_superlatives + last_listing_superlatives.",
          status: startupFullEnabled ? "scheduled" : "skipped",
          statusLabel: startupFullEnabled ? "Chained" : "—",
        },
        {
          id: "startup-full-caches",
          title: "Stats + Deal of the Day caches",
          timing: "after superlatives",
          detail:
            "rebuildStatsCache (market stats, sales-by-month, active-by-month, vintage, price) + Deal of the Day/Week caches + If estimates + comps edges + edge scores, then publish read snapshot.",
          status: startupFullEnabled ? "scheduled" : "skipped",
          statusLabel: startupFullEnabled ? "Chained" : "—",
        },
      ],
    },
    {
      id: "incremental",
      title: "Incremental Latest sync",
      subtitle: "Keeps /latest fresh from Postgres — never per-request RETS",
      steps: [
        {
          id: "incremental-first",
          title: "First incremental pull",
          timing: startupFullEnabled ? "+90s" : "+12s",
          detail: "Delayed so startup full reload gets a head start when active.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Scheduled" : "Disabled",
        },
        {
          id: "incremental-cadence",
          title: "Repeat modified-since sync",
          timing: `every ${Math.round(latestIntervalMs / 60_000)} min`,
          detail:
            "syncIncrementalListings(); price changes trigger targeted rescores; then Latest town feeds + bounded hero thumbnails warm into stats_cache / listing-photos.",
          status: latestSyncEnabled ? "active" : "skipped",
          statusLabel: latestSyncEnabled ? "Running" : "Disabled",
        },
        {
          id: "incremental-spotlight-status",
          title: "Spotlight status refresh",
          timing: "after each incremental",
          detail:
            "refreshSpotlightStatuses(): polls RETS for the 5 spotlight listings' current status (incl. off-market states the Active-only incremental skips) and writes it to Postgres so the public badge stays truthful.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Chained" : "—",
        },
        {
          id: "incremental-town-feeds",
          title: "Latest town feed warm",
          timing: "after each incremental",
          detail:
            "rebuildLatestTownFeedCaches(): global Latest ticker + top 30 per town (parallel) into stats_cache bundle; then bounded hero photo warm (~48 RETS fetches max per cycle).",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Chained" : "—",
        },
        {
          id: "incremental-intel-board",
          title: "Intelligence deal-board warm",
          timing: "after each incremental",
          detail:
            "rebuildIntelligenceDealBoardCache(): slim scored listings, per-listing insight headlines, + sales meta for /intelligence.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Chained" : "—",
        },
      ],
    },
    {
      id: "weekly",
      title: "Weekly full reload",
      subtitle: "Long-lived Node processes; Netlify also has sync-listings-full cron",
      steps: [
        {
          id: "weekly-mon-5am",
          title: "Full reload @ 5:00 AM Monday America/New_York",
          timing: "weekly",
          detail: "syncAllTownListings() → scores → superlatives → stats/DOTD caches → read snapshot. Admin step 1 for manual mid-week runs.",
          status: fullReloadEnabled ? "scheduled" : "skipped",
          statusLabel: fullReloadEnabled ? "Armed" : "Disabled",
        },
      ],
    },
    {
      id: "edge-scores",
      title: "Listing edge scores",
      subtitle: "Weekly metadata scores for comparables ranking",
      steps: [
        {
          id: "edge-scores-weekly",
          title: "Rebuild @ 2:00 AM Monday America/New_York",
          timing: "weekly",
          detail:
            "rebuildAllListingEdgeScores(): zip benchmarks, layout, condition (remarks + cached finish-quality) into listing_edge_scores.",
          status: edgeScoreRebuildEnabled ? "scheduled" : "skipped",
          statusLabel: edgeScoreRebuildEnabled ? "Armed" : "Disabled",
        },
        {
          id: "edge-scores-full-sync",
          title: "Rebuild after full sync",
          timing: "after comps edges",
          detail:
            "rebuildAllListingEdgeScores() runs synchronously during syncAllTownListings() so bundled DB + API reads have scores immediately.",
          status: fullReloadEnabled ? "scheduled" : "skipped",
          statusLabel: fullReloadEnabled ? "Chained" : "—",
        },
      ],
    },
    {
      id: "property-addresses",
      title: "Property address directory",
      subtitle: "List With Me autocomplete · MLS + assessor (Vision)",
      steps: [
        {
          id: "property-address-weekly",
          title: "Verify + enrich @ 1:00 AM Monday America/New_York",
          timing: "weekly",
          detail:
            "syncPropertyAddresses(): MLS parcels/addresses + Vision recent sales; shared property_key when parcel matches.",
          status: propertyAddressSyncEnabled ? "scheduled" : "skipped",
          statusLabel: propertyAddressSyncEnabled ? "Armed" : "Disabled",
        },
      ],
    },
    {
      id: "stats",
      title: "Stats cache refresh",
      subtitle: "Background Intelligence / stats payload rebuild",
      steps: [
        {
          id: "stats-first",
          title: "First stale-check",
          timing: "+20s",
          detail: "Skipped while a listings refresh is in progress.",
          status: "scheduled",
          statusLabel: "Scheduled",
        },
        {
          id: "stats-superlatives-warm",
          title: "Listing superlatives warm",
          timing: "+22s",
          detail:
            "rebuildAllListingSuperlativesIfMissing() when last_listing_superlatives is absent.",
          status: "scheduled",
          statusLabel: "Scheduled",
        },
        {
          id: "stats-interval",
          title: "Periodic rebuild if stale",
          timing: "usually every 60 min",
          detail:
            "rebuildStatsCacheIfStale(true) — includes sales-by-month + active-by-month per town and bundled by-town payloads.",
          status: "active",
          statusLabel: "Running",
        },
      ],
    },
  ];

  if (smartIntervalEnabled || netlifyWarmEnabled) {
    lanes.splice(3, 0, {
      id: "smart",
      title: "Smart listings sync",
      subtitle: allowListingsSync
        ? "Production / Netlify / ENABLE_BACKGROUND_SQLITE_REFRESH"
        : "Inactive in this process",
      steps: smartIntervalEnabled
        ? [
            {
              id: "smart-interval",
              title: "syncListingsSmart interval",
              timing: `+10s, then every ${Math.round(listingsIntervalMs / 60_000)} min`,
              detail: "Configured via LISTINGS_SYNC_INTERVAL_MS.",
              status: "active",
              statusLabel: "Running",
            },
          ]
        : [
            {
              id: "smart-warm",
              title: "Schedule post-deploy full warm",
              timing: "+8s",
              detail:
                "When Postgres has no listings after a deploy, schedules background full reload (~2 min). Countdown appears on admin Full resync row.",
              status: netlifyWarmEnabled ? "scheduled" : "skipped",
              statusLabel: netlifyWarmEnabled ? "Scheduled" : "—",
            },
          ],
    });
  }

  if (netlify) {
    lanes.unshift({
      id: "deploy",
      title: "Deploy build (Netlify)",
      subtitle: "Happens before the Node process starts serving traffic",
      steps: [
        {
          id: "deploy-sync",
          title: "Build-time sync (skipped)",
          timing: "netlify build",
          detail:
            "npm run build:netlify rebuilds better-sqlite3 for listing-photos SQLite, then next build. MLS inventory persists in Neon Postgres.",
          status: "info",
          statusLabel: "Build",
        },
        {
          id: "deploy-cron",
          title: "Post-deploy full warm",
          timing: `~${postDeployDelayLabel()} after first request`,
          detail:
            "After each Netlify deploy, the first serverless request schedules a background full MLS reload when Postgres has no listings yet. Admin Full resync row shows a live countdown until then.",
          status: "info",
          statusLabel: "Warm",
        },
        {
          id: "deploy-cron-daily",
          title: "Runtime crons",
          timing: "scheduled functions",
          detail: `sync-listings every ${Math.round(LATEST_DB_REFRESH_MS / 60_000)} min (incremental) + sync-listings-full weekly Mon ~5am ET + sync-property-addresses weekly Mon ~1am ET.`,
          status: "info",
          statusLabel: "Cron",
        },
      ],
    });
  }

  return {
    context: {
      runtime: process.env.NEXT_RUNTIME ?? "nodejs",
      retsConfigured,
      netlify,
      nodeEnv,
    },
    lanes,
  };
}
