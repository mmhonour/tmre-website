"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_ARCHITECTURE_PANELS,
  adminArchitecturePanelForSection,
  isAdminArchitecturePanelId,
  LEGACY_ADMIN_TAB_TO_ARCHITECTURE,
  type AdminArchitecturePanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(
  ADMIN_ARCHITECTURE_PANELS.map((p) => p.id),
);

function panelFromLocation(): AdminArchitecturePanelId {
  if (typeof window === "undefined") return "map";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && LEGACY_ADMIN_TAB_TO_ARCHITECTURE[tab]) {
    return LEGACY_ADMIN_TAB_TO_ARCHITECTURE[tab]!;
  }
  if (tab && tab !== "architecture") return "map";
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminArchitecturePanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminArchitecturePanelForSection(hash);
  if (fromSection) return fromSection;
  return "map";
}

export default function AdminArchitecturePanel({
  map,
  docs,
  statusLogic,
}: {
  map: ReactNode;
  docs: ReactNode;
  statusLogic: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminArchitecturePanelId>("map");

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

  function selectPanel(next: AdminArchitecturePanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "architecture");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminArchitecturePanelId, ReactNode> = {
    map,
    docs,
    "status-logic": statusLogic,
  };
  const active = ADMIN_ARCHITECTURE_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Architecture"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_ARCHITECTURE_PANELS.map((item) => {
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

      {ADMIN_ARCHITECTURE_PANELS.map((item) => (
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
