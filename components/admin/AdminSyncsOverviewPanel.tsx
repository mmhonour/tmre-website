import AdminNumberedPanel from "@/components/admin/AdminNumberedPanel";
import AdminStartupDiagram from "@/components/admin/AdminStartupDiagram";
import AdminZipBoundariesSyncPanel from "@/components/admin/AdminZipBoundariesSyncPanel";
import { ADMIN_NETLIFY_FUNCTIONS, adminSectionHref } from "@/lib/admin-nav";
import type { StartupFlowLane } from "@/lib/startup-process";
import type { ScheduledSyncPausedJobs } from "@/lib/scheduled-sync-jobs-shared";
import { SCHEDULED_SYNC_JOB_IDS } from "@/lib/scheduled-sync-jobs-shared";

const NETLIFY_PAUSE_BY_FN: Record<string, (typeof SCHEDULED_SYNC_JOB_IDS)[number] | null> = {
  "sync-listings": "incremental",
  "sync-listings-full": "full-resync",
  "sync-property-addresses": "property-addresses",
  "sync-listing-edge-scores": "listing-scores",
  "sync-zip-boundaries": "zip-boundaries",
};

type ZipInventory = {
  storedCount: number;
  expectedCount: number;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  stale: boolean;
};

export default function AdminSyncsOverviewPanel({
  startupLanes,
  startupContext,
  pausedJobs,
  zipInventory,
  zipLastSyncAt,
  zipLastSyncStartedAt,
  zipNextRunAt,
}: {
  startupLanes: StartupFlowLane[];
  startupContext: {
    runtime: string;
    retsConfigured: boolean;
    netlify: boolean;
    nodeEnv: string;
  };
  pausedJobs: ScheduledSyncPausedJobs;
  zipInventory: ZipInventory;
  zipLastSyncAt: string | null;
  zipLastSyncStartedAt: string | null;
  zipNextRunAt: string | null;
}) {
  const anyNetlifyPaused = ADMIN_NETLIFY_FUNCTIONS.some((fn) => {
    const job = NETLIFY_PAUSE_BY_FN[fn.label];
    return job != null && pausedJobs[job];
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-charcoal/65 max-w-3xl leading-relaxed">
        Schedules, Netlify cron workers, and non-MLS data syncs. Pause toggles live on{" "}
        <a
          href={adminSectionHref("admin-sync", "db")}
          className="text-navy underline-offset-2 hover:underline"
        >
          Database → Sync status
        </a>
        ; paused jobs show a badge here.
      </p>

      <AdminNumberedPanel
        number={1}
        id="admin-startup"
        title="Startup schedule"
        subtitle="What runs after this Node process boots — mirrors instrumentation.ts"
      >
        <div className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-5 [&_.mt-6]:mt-0">
          <AdminStartupDiagram lanes={startupLanes} context={startupContext} />
        </div>
      </AdminNumberedPanel>

      <AdminNumberedPanel
        number={2}
        id="admin-netlify"
        title="Netlify scheduled functions"
        subtitle="Background workers in netlify/functions/ — pause flags come from the Database tab"
        paused={anyNetlifyPaused}
        pauseLabel="One or more crons paused on Database tab"
      >
        <ul className="divide-y divide-charcoal/[0.08] -mx-5 sm:-mx-6">
          {ADMIN_NETLIFY_FUNCTIONS.map((fn) => {
            const job = NETLIFY_PAUSE_BY_FN[fn.label];
            const paused = job != null && pausedJobs[job];
            return (
              <li key={fn.label} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                      {fn.label}
                    </p>
                    {paused ? (
                      <span className="inline-flex items-center rounded-full border border-coral/30 bg-coral/10 px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-coral">
                        Paused on Database tab
                      </span>
                    ) : null}
                  </div>
                  {fn.schedule ? (
                    <span className="font-mono text-[10px] tracking-[0.1em] text-gold">
                      {fn.schedule}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-charcoal/65">{fn.detail}</p>
              </li>
            );
          })}
        </ul>
      </AdminNumberedPanel>

      <AdminNumberedPanel
        number={3}
        id="admin-zip-boundaries"
        title="Census TIGERweb zip boundaries"
        subtitle="Monthly ZCTA GeoJSON → Postgres for Intelligence / Latest map popovers"
        paused={pausedJobs["zip-boundaries"]}
      >
        <AdminZipBoundariesSyncPanel
          inventory={zipInventory}
          lastSyncAt={zipLastSyncAt}
          lastSyncStartedAt={zipLastSyncStartedAt}
          nextRunAt={zipNextRunAt}
        />
      </AdminNumberedPanel>
    </div>
  );
}
