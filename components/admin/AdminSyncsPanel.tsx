"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_SYNCS_PANELS,
  adminSyncsPanelForSection,
  isAdminSyncsPanelId,
  LEGACY_ADMIN_PANEL_TO_SYNCS,
  type AdminSyncsPanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(ADMIN_SYNCS_PANELS.map((p) => p.id));

function panelFromLocation(): AdminSyncsPanelId {
  if (typeof window === "undefined") return "configure";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  const panel = params.get("panel");

  // Legacy top-level sync-log, or old Database sync panels.
  if (tab === "sync-log") return "history";
  if (panel && LEGACY_ADMIN_PANEL_TO_SYNCS[panel]) {
    return LEGACY_ADMIN_PANEL_TO_SYNCS[panel]!;
  }
  if (tab && tab !== "syncs") return "configure";
  if (panel && VALID_PANELS.has(panel) && isAdminSyncsPanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminSyncsPanelForSection(hash);
  if (fromSection) return fromSection;
  return "configure";
}

export default function AdminSyncsPanel({
  configure,
  history,
  overview,
}: {
  configure: ReactNode;
  history: ReactNode;
  overview: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminSyncsPanelId>("configure");

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

  const panels: Record<AdminSyncsPanelId, ReactNode> = {
    configure,
    history,
    overview,
  };
  const active = ADMIN_SYNCS_PANELS.find((item) => item.id === panel);

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

      {ADMIN_SYNCS_PANELS.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          hidden={panel !== item.id}
          className={panel === item.id ? "space-y-6" : undefined}
        >
          {panels[item.id]}
        </div>
      ))}
    </div>
  );
}
