"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_COOKIES_PANELS,
  adminCookiesPanelForSection,
  isAdminCookiesPanelId,
  type AdminCookiesPanelId,
} from "@/lib/admin-nav";

const VALID_PANELS = new Set<string>(ADMIN_COOKIES_PANELS.map((p) => p.id));

function panelFromLocation(): AdminCookiesPanelId {
  if (typeof window === "undefined") return "cookies";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && tab !== "cookies") return "cookies";
  const panel = params.get("panel");
  if (panel && VALID_PANELS.has(panel) && isAdminCookiesPanelId(panel)) {
    return panel;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const fromSection = adminCookiesPanelForSection(hash);
  if (fromSection) return fromSection;
  return "cookies";
}

/**
 * Admin → Cookies: live cookie jar + ephemeral memory/browser cache catalog.
 */
export default function AdminCookiesPanel({
  cookies,
  ephemeral,
}: {
  cookies: ReactNode;
  ephemeral: ReactNode;
}) {
  const [panel, setPanel] = useState<AdminCookiesPanelId>("cookies");

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

  function selectPanel(next: AdminCookiesPanelId) {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "cookies");
    url.searchParams.set("panel", next);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminCookiesPanelId, ReactNode> = {
    cookies,
    ephemeral,
  };
  const active = ADMIN_COOKIES_PANELS.find((item) => item.id === panel);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Cookies"
        className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.1]"
      >
        {ADMIN_COOKIES_PANELS.map((item) => {
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
      {panels[panel]}
    </div>
  );
}
