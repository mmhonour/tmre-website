"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_COMMUNICATIONS_PANELS,
  adminCommunicationsPanelForSection,
  isAdminCommunicationsPanelId,
  type AdminCommunicationsPanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(
  ADMIN_COMMUNICATIONS_PANELS.map((p) => p.id),
);

function panelFromLocation(): AdminCommunicationsPanelId {
  if (typeof window === "undefined") return "market-digest";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && tab !== "communications") return "market-digest";
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminCommunicationsPanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminCommunicationsPanelForSection(hash);
  if (fromSection) return fromSection;
  return "market-digest";
}

export default function AdminCommunicationsPanel({
  marketDigest,
  socialProfiles,
  listingAlerts,
}: {
  marketDigest: ReactNode;
  socialProfiles: ReactNode;
  listingAlerts: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminCommunicationsPanelId>("market-digest");

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

  function selectPanel(next: AdminCommunicationsPanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "communications");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminCommunicationsPanelId, ReactNode> = {
    "market-digest": marketDigest,
    "social-profiles": socialProfiles,
    "listing-alerts": listingAlerts,
  };
  const active = ADMIN_COMMUNICATIONS_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Communications"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_COMMUNICATIONS_PANELS.map((item) => {
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

      {ADMIN_COMMUNICATIONS_PANELS.map((item) => (
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
