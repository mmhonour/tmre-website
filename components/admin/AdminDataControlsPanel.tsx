"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_DATA_CONTROLS_PANELS,
  adminDataControlsPanelForSection,
  isAdminDataControlsPanelId,
  LEGACY_ADMIN_TAB_TO_DATA_CONTROLS,
  type AdminDataControlsPanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(
  ADMIN_DATA_CONTROLS_PANELS.map((p) => p.id),
);

function panelFromLocation(): AdminDataControlsPanelId {
  if (typeof window === "undefined") return "site";
  const params = new URLSearchParams(window.location.search);
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminDataControlsPanelId(panel)) {
    return panel;
  }
  // Legacy top-level tabs: ?tab=site|spotlight|goldilocks|pricing
  const tab = params.get("tab");
  if (tab && LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[tab]) {
    return LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[tab]!;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminDataControlsPanelForSection(hash);
  if (fromSection) return fromSection;
  return "site";
}

export default function AdminDataControlsPanel({
  site,
  spotlight,
  goldilocks,
  pricing,
  vintages,
}: {
  site: ReactNode;
  spotlight: ReactNode;
  goldilocks: ReactNode;
  pricing: ReactNode;
  vintages: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminDataControlsPanelId>("site");

  useEffect(() => {
    const sync = () => setPanel(panelFromLocation());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  function selectPanel(next: AdminDataControlsPanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "data-controls");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminDataControlsPanelId, ReactNode> = {
    site,
    spotlight,
    goldilocks,
    pricing,
    vintages,
  };
  const active = ADMIN_DATA_CONTROLS_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Data controls"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_DATA_CONTROLS_PANELS.map((item) => {
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

      {ADMIN_DATA_CONTROLS_PANELS.map((item) => (
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
