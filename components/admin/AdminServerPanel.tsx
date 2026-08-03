"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_SERVER_PANELS,
  adminServerPanelForSection,
  isAdminServerPanelId,
  type AdminServerPanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(ADMIN_SERVER_PANELS.map((p) => p.id));

function panelFromLocation(): AdminServerPanelId {
  if (typeof window === "undefined") return "api-routes";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && tab !== "server") return "api-routes";
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminServerPanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminServerPanelForSection(hash);
  if (fromSection) return fromSection;
  return "api-routes";
}

export default function AdminServerPanel({
  apiRoutes,
  pageStyles,
  uiKit,
  intelDescriptorSizes,
}: {
  apiRoutes: ReactNode;
  pageStyles: ReactNode;
  uiKit: ReactNode;
  intelDescriptorSizes: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminServerPanelId>("api-routes");

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

  function selectPanel(next: AdminServerPanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "server");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminServerPanelId, ReactNode> = {
    "api-routes": apiRoutes,
    "page-styles": pageStyles,
    "ui-kit": uiKit,
    "intel-descriptor-sizes": intelDescriptorSizes,
  };
  const active = ADMIN_SERVER_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Web server"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_SERVER_PANELS.map((item) => {
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
      <div>{panels[panel]}</div>
    </div>
  );
}
