"use client";

import { useEffect, useState, type ReactNode } from "react";
import AdminSyncTable, {
  type AdminSyncRow,
  type AdminSyncTableMode,
  type PanelStatus,
} from "@/components/admin/AdminSyncTable";
import {
  ADMIN_SYNCS_PANELS,
  adminSyncsPanelForSection,
  isAdminSyncsPanelId,
  LEGACY_ADMIN_PANEL_TO_SYNCS,
  type AdminSyncsPanelId,
} from "@/lib/admin-nav";
import type { ScheduledSyncPausedJobs } from "@/lib/scheduled-sync-jobs-shared";

const VALID_PANELS = new Set<string>(ADMIN_SYNCS_PANELS.map((p) => p.id));

function panelFromLocation(): AdminSyncsPanelId {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  const panel = params.get("panel");

  // Legacy top-level sync-log, or old Database sync panels.
  if (tab === "sync-log") return "history";
  if (panel && LEGACY_ADMIN_PANEL_TO_SYNCS[panel]) {
    return LEGACY_ADMIN_PANEL_TO_SYNCS[panel]!;
  }
  if (tab && tab !== "syncs") return "dashboard";
  if (panel && VALID_PANELS.has(panel) && isAdminSyncsPanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminSyncsPanelForSection(hash);
  if (fromSection) return fromSection;
  return "dashboard";
}

function opsModeForPanel(panel: AdminSyncsPanelId): AdminSyncTableMode {
  return panel === "configure" ? "configure" : "dashboard";
}

export default function AdminSyncsPanel({
  syncRows,
  initialRefreshing,
  initialStatus,
  initialPausedJobs,
  history,
  overview,
  dbTuning,
  storeLabel,
  storeLabelClassName,
  lambdaLine,
}: {
  syncRows: AdminSyncRow[];
  initialRefreshing: boolean;
  initialStatus?: PanelStatus;
  initialPausedJobs?: ScheduledSyncPausedJobs;
  history: ReactNode;
  overview: ReactNode;
  dbTuning: ReactNode;
  storeLabel: string;
  storeLabelClassName: string;
  lambdaLine?: string | null;
}) {
  const [panel, setPanel] = useState<AdminSyncsPanelId>("dashboard");

  useEffect(() => {
    const syncFromLocation = () => setPanel(panelFromLocation());
    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  function selectPanel(next: AdminSyncsPanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "syncs");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const active = ADMIN_SYNCS_PANELS.find((item) => item.id === panel);
  const showOps = panel === "dashboard" || panel === "configure";
  const opsMode = opsModeForPanel(panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Syncs"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_SYNCS_PANELS.map((item) => {
          const isActive = panel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectPanel(item.id)}
              className={`shrink-0 -mb-px border-b-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors ${
                isActive
                  ? "border-gold text-navy"
                  : "border-transparent text-charcoal/50 hover:border-charcoal/15 hover:text-navy"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {active?.subtitle ? (
        <p className="-mt-3 text-xs leading-snug text-charcoal/55">
          {active.subtitle}
        </p>
      ) : null}

      {/* Keep one SyncTable mounted so run state survives Dashboard ↔ Configure. */}
      <div
        id="admin-sync"
        hidden={!showOps}
        className={
          showOps
            ? "scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
            : undefined
        }
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex items-baseline justify-between gap-4">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            {opsMode === "configure" ? "Sync configure" : "Syncs dashboard"}
          </p>
          <p className="font-mono text-[10px] tracking-[0.08em] text-right leading-tight">
            <span className={storeLabelClassName}>{storeLabel}</span>
            {lambdaLine ? (
              <span className="block text-charcoal/30 mt-0.5">{lambdaLine}</span>
            ) : null}
          </p>
        </div>
        <AdminSyncTable
          mode={opsMode}
          rows={syncRows}
          initialRefreshing={initialRefreshing}
          initialStatus={initialStatus}
          initialPausedJobs={initialPausedJobs}
        />
      </div>

      <div
        role="tabpanel"
        hidden={panel !== "history"}
        className={panel === "history" ? "space-y-6" : undefined}
      >
        {history}
      </div>
      <div
        role="tabpanel"
        hidden={panel !== "overview"}
        className={panel === "overview" ? "space-y-6" : undefined}
      >
        {overview}
      </div>
      <div
        role="tabpanel"
        hidden={panel !== "db-tuning"}
        className={panel === "db-tuning" ? "space-y-6" : undefined}
      >
        {dbTuning}
      </div>
    </div>
  );
}
