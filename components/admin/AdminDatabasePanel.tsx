"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_DATABASE_PANELS,
  adminDatabasePanelForSection,
  isAdminDatabasePanelId,
  type AdminDatabasePanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(ADMIN_DATABASE_PANELS.map((p) => p.id));

function panelFromLocation(): AdminDatabasePanelId {
  if (typeof window === "undefined") return "rets-connection";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && tab !== "db") {
    return "rets-connection";
  }
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminDatabasePanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminDatabasePanelForSection(hash);
  if (fromSection) return fromSection;
  return "rets-connection";
}

export default function AdminDatabasePanel({
  retsConnection,
  inventory,
  townCounts,
}: {
  retsConnection: ReactNode;
  inventory: ReactNode;
  townCounts: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminDatabasePanelId>("rets-connection");

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

  function selectPanel(next: AdminDatabasePanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "db");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminDatabasePanelId, ReactNode> = {
    "rets-connection": retsConnection,
    inventory,
    "town-counts": townCounts,
  };
  const active = ADMIN_DATABASE_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Database"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_DATABASE_PANELS.map((item) => {
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

      {ADMIN_DATABASE_PANELS.map((item) => (
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
