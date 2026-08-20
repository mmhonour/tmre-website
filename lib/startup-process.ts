import { LATEST_DB_REFRESH_MS } from "@/lib/latest-refresh";
import { isServerlessRuntime } from "@/lib/runtime-host";
import { isFullResyncRetired } from "@/lib/scheduled-sync-jobs-shared";

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
    envFlagEnabled('ENABLE_STARTUP_FULL_SYNC') &&
    retsConfigured &&
    !netlify &&
    !overdueCatchupEnabled &&
    !isFullResyncRetired()
  const latestSyncEnabled =
    envFlagEnabled("ENABLE_LATEST_SYNC") && (allowListingsSync || retsConfigured);
  const propertyAddressSyncEnabled =
    envFlagEnabled("ENABLE_PROPERTY_ADDRESS_SYNC") && allowListingsSync;
  const visionAddressSyncEnabled =
    envFlagEnabled("ENABLE_VISION_ADDRESS_SYNC") && allowListingsSync;
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
      subtitle: isServerlessRuntime()
        ? "Process-start catch-up is off on Netlify — thin crons and dedicated workers own it"
        : "Serial overdue jobs after host wakeup (local / long-lived Node)",
      steps: [
        {
          id: "overdue-schedule",
          title: "Detect overdue admin sync windows",
          timing: isServerlessRuntime()
            ? "not on process start"
            : `+${Math.round(overdueCatchupDelayMs / 1000)}s`,
          detail:
            "buildOverdueSyncPlan(): incremental, scores, stats, DOTD, snapshot, addresses, edge scores — one run each. Full resync is retired and is never caught up. On Netlify, every Next.js Lambda boot used to queue catch-up (via=admin) and 429-storm Stats cache when End was stale.",
          status:
            overdueCatchupEnabled && !isServerlessRuntime()
              ? "scheduled"
              : "skipped",
          statusLabel:
            overdueCatchupEnabled && !isServerlessRuntime()
              ? "Scheduled"
              : overdueCatchupEnabled
                ? "Thin crons / workers"
                : "Disabled",
        },
        {
          id: "overdue-run",
          title: "Serial catch-up execution",
          timing: isServerlessRuntime() ? "workers only" : "after delay",
          detail:
            "runOverdueSyncCatchup() uses a Postgres timed lock (not the per-Lambda sync_meta cache) so concurrent instances cannot stampede. A queue ack is not a finished rebuild — dedicated Goldilocks / Edge / stats / DOTD workers always execute their own job. Incremental listings catch-up only stamps publish-snapshot; it does not re-queue Stats cache.",
          status:
            overdueCatchupEnabled && !isServerlessRuntime()
              ? "scheduled"
              : "skipped",
          statusLabel:
            overdueCatchupEnabled && !isServerlessRuntime()
              ? "Chained"
              : overdueCatchupEnabled
                ? "Workers"
                : "—",
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
            "syncAllTownListings() is retired from startup. Incremental / overdue catch-up keep inventory without deleting older MLS rows.",
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
            "rebuildStatsCache (market stats, sales-by-month, active-by-month, vintage, price, avg-score-by-vintage) + Deal of the Day/Week caches + If estimates + comps edges + edge scores, then stamp refresh finished.",
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
          title: "Repeat modified-since sync (Lane 1)",
          timing: `every ${Math.round(latestIntervalMs / 60_000)} min`,
          detail:
            "Preferred: Railway mls-sync (MLS_SYNC_SERVICE=1) pulls RETS → Neon with postHooks:false, stamps End + last_mls_sync_heartbeat, then queues Netlify sideWorkOnly for warm. Configure → Incremental → Railway. Legacy: Netlify sync-listings (*/30) or EventBridge → sync-listings-worker with full RETS + postHooks. See Syncs → Dashboard ownership lanes.",
          status: latestSyncEnabled ? "active" : "skipped",
          statusLabel: latestSyncEnabled ? "Running" : "Disabled",
        },
        {
          id: "incremental-watchdog",
          title: "Stale incremental watchdog",
          timing: "every 15 min + Admin open",
          detail:
            "Netlify path only: if End older than ~70m, Incremental not paused, and Scheduler is still Netlify — clear dead Queued and re-queue worker (source=watchdog). When Scheduler is Railway, heal via mls-sync interval / Admin Sync now → POST /run. Diagram: Syncs → Dashboard.",
          status: latestSyncEnabled ? "active" : "skipped",
          statusLabel: latestSyncEnabled ? "Running" : "Disabled",
        },
        {
          id: "incremental-spotlight-status",
          title: "Spotlight status refresh (Lane 3)",
          timing: "Netlify sideWorkOnly / digests",
          detail:
            "refreshSpotlightStatuses(): runs on Netlify after Railway warm handoff (or legacy postHooks path). Polls RETS for the 5 spotlight listings’ current status and writes Postgres so the public badge stays truthful.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Netlify warm" : "—",
        },
        {
          id: "incremental-saved-search-alerts",
          title: "Saved-search listing alerts (Lane 3)",
          timing: "Netlify digests after handoff",
          detail:
            "processDueSavedSearchAlerts(): email visitors when new Active listings match their cookie-derived criteria. Owned by Netlify Lane 3 — not the Railway puller.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Netlify warm" : "—",
        },
        {
          id: "incremental-town-feeds",
          title: "Latest town feed warm (Lane 3)",
          timing: "Netlify sideWorkOnly after handoff",
          detail:
            "rebuildLatestTownFeedCaches() on Netlify — never inside Railway mls-sync (that combination Node-OOMed the puller). Also available via stale-read rebuild if the warm-handoff hop fails.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Netlify warm" : "—",
        },
        {
          id: "incremental-intel-board",
          title: "Intelligence deal-board warm (Lane 3)",
          timing: "Netlify sideWorkOnly after handoff",
          detail:
            "rebuildIntelligenceDealBoardCache() on Netlify only. Railway stops at the Neon write (Lane 2); boards refresh from Lane 3 or stale-read.",
          status: latestSyncEnabled ? "scheduled" : "skipped",
          statusLabel: latestSyncEnabled ? "Netlify warm" : "—",
        },
      ],
    },
    {
      id: "weekly",
      title: "Weekly full reload",
      subtitle: "Retired — Incremental preserves older MLS rows",
      steps: [
        {
          id: "weekly-mon-5am",
          title: "Full reload @ 5:00 AM Monday America/New_York",
          timing: "retired",
          detail:
            "syncAllTownListings() remains as a CLI stub (FULL_RESYNC_CONFIRM=1). Hidden from Admin. Bucket replace would delete listings RETS no longer returns.",
          status: "skipped",
          statusLabel: "Retired",
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
            "rebuildAllListingEdgeScores(): zip benchmarks, layout, condition (remarks + cached finish-quality) into listing_edge_scores. Netlify */30 thin cron sync-listing-edge-scores + edge-scores Configure cadence, gated on last_listing_edge_scores (not Goldilocks End). Skips when Pause is checked on Edge scores (3b).",
          status: edgeScoreRebuildEnabled ? "scheduled" : "skipped",
          statusLabel: edgeScoreRebuildEnabled ? "Armed" : "Disabled",
        },
        {
          id: "edge-scores-full-sync",
          title: "Rebuild after full sync",
          timing: "after comps edges",
          detail:
            "rebuildAllListingEdgeScores() used to run during full resync; that job is retired. Edge scores run on their own Configure cadence.",
          status: "skipped",
          statusLabel: "Retired",
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
            "syncPropertyAddresses(): MLS parcels/addresses + Vision recent sales; shared property_key when parcel matches. Skips when Pause is checked on Property address directory.",
          status: propertyAddressSyncEnabled ? "scheduled" : "skipped",
          statusLabel: propertyAddressSyncEnabled ? "Armed" : "Disabled",
        },
      ],
    },
    {
      id: "vision-addresses",
      title: "Vision addresses (GIS)",
      subtitle: "VGSI cadastral crawl · vision_addresses JSON + Field Card HTML pointer",
      steps: [
        {
          id: "vision-address-weekly",
          title: "Chunked crawl @ 1:30 AM Monday America/New_York",
          timing: "weekly",
          detail:
            "syncVisionAddresses(): Streets→Parcel Field Card parse → Neon vision_addresses.field_card JSON + R2 HTML pointer; full fill then fingerprint incremental; then backfillVisionListingLinks() (lib/vision-listing-match.ts: zip strip, street type/compass, name words, exact key, trailing street type, unique MBLU; 1 PID stamps every listing at that key). Same join: npm run match:vision-listings. Netlify thin sync-vision-addresses → worker. Skips when Pause is checked on Vision addresses (GIS).",
          status: visionAddressSyncEnabled ? "scheduled" : "skipped",
          statusLabel: visionAddressSyncEnabled ? "Armed" : "Disabled",
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
          title: "First dirty-town check",
          timing: "+20s",
          detail: "Skipped while a listings refresh is in progress, or when Pause is checked on Stats cache.",
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
          title: "Periodic dirty-town sweep",
          timing: "usually every 10 min",
          detail:
            "rebuildStatsCacheIfStale(false) — rebuilds only the towns the incremental sync marked dirty (stats_dirty:<Town> in sync_meta), plus any town whose last rebuild is over 24h old, plus the whole cache when required keys are missing. There is no hourly TTL trigger any more: an unchanged town is not rebuilt. Skips while the stats rebuild lock or a listings refresh is held. Long-lived Node only: on Netlify this is off, because a request-scoped invocation cannot finish a rebuild but can freeze holding the lock. Who rebuilds is declared in Configure → Stats cache → Scheduler: Railway mls-sync (default; 10-min dirty sweep + POST /stats) or Netlify cron (thin */30 → sync-stats-cache-worker, which also stands down when nothing is dirty). Exactly one host acts — each stands down when the radio names the other.",
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
              title: "Post-deploy full warm",
              timing: "retired",
              detail:
                "Would schedule a background full MLS reload when Postgres is empty after deploy. Retired so older listings are not deleted. Use Incremental if inventory is empty.",
              status: "skipped",
              statusLabel: "Retired",
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
          timing: "retired",
          detail:
            "Formerly queued a background full MLS reload after deploy when Postgres had no listings. Retired — Incremental is the live inventory path.",
          status: "skipped",
          statusLabel: "Retired",
        },
        {
          id: "deploy-cron-daily",
          title: "Runtime crons",
          timing: "scheduled functions",
          detail: `Thin schedules queue background *-worker functions (schedule XOR background — never both). sync-listings every ${Math.round(LATEST_DB_REFRESH_MS / 60_000)} min + sync-listings-full weekly Mon ~5am ET + sync-property-addresses weekly Mon ~1am ET + sync-vision-addresses weekly Mon ~1:30am ET + market-digest every 30m gated to weekly Mon ~8am ET + sync-zip-boundaries monthly (1st ~10:00 UTC) + sync-fomc / sync-cpi every 30m gated to FOMC decision day 3:15pm ET / CPI release day 9:15am ET. Jobs with Configure Scheduler=EventBridge are skipped by Netlify thin crons; AWS hits eventbridge-sync-ingress instead.`,
          status: "info",
          statusLabel: "Cron",
        },
      ],
    });
  }

  lanes.push({
    id: "fed-event-sync",
    title: "Fed / CPI event syncs",
    subtitle: "Official statement scrapes for /fed-analysis (Syncs dashboard)",
    steps: [
      {
        id: "fomc-sync-cron",
        title: "FOMC statement sync",
        timing: "Decision day ~3:15 p.m. ET",
        detail:
          "netlify/functions/sync-fomc → sync-fomc-worker: scrape federalreserve.gov statement into fomc_meetings. Dense */30 cron; runs only when today is an FOMC endDate and Configure start time (default 15:15 ET) has passed. Pause on Syncs → Configure.",
        status: "scheduled",
        statusLabel: "Cron",
      },
      {
        id: "cpi-sync-cron",
        title: "CPI release sync",
        timing: "Release day ~9:15 a.m. ET",
        detail:
          "netlify/functions/sync-cpi → sync-cpi-worker: scrape bls.gov CPI news release into cpi_releases (summary + highlights). Dense */30 cron; runs only when today is a CPI releaseDate and Configure start time (default 09:15 ET) has passed.",
        status: "scheduled",
        statusLabel: "Cron",
      },
    ],
  });

  lanes.push({
    id: "zip-boundaries",
    title: "Zip boundary maps (TIGERweb)",
    subtitle: "Census ZCTA rings → Postgres for Intelligence / Latest SVG maps",
    steps: [
      {
        id: "zip-boundaries-monthly",
        title: "Monthly TIGERweb → zip_boundaries",
        timing: "1st of month ~10:00 UTC",
        detail:
          "syncAllTmreZipBoundaries() / Netlify sync-zip-boundaries. Skips when Pause is checked on Zip boundary maps (Database tab). Maps read GET /api/zip-boundaries.",
        status: "scheduled",
        statusLabel: "Cron",
      },
    ],
  });

  lanes.push({
    id: "market-digest",
    title: "Monday market brief",
    subtitle: "Months supply + inventory email (Netlify cron + Admin Syncs)",
    steps: [
      {
        id: "market-digest-cron",
        title: "Send Monday market digest",
        timing: "Every 30m → weekly Mon ~8am ET (Configure)",
        detail:
          "netlify/functions/market-digest → market-digest-worker → sendMarketDigestEmail(). Pause/Run/schedule on Admin → Syncs; recipient/subject/social on Communications → Monday market brief.",
        status: "scheduled",
        statusLabel: "Cron",
      },
    ],
  });

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
