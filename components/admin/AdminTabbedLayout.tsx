"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_TABS,
  adminArchitecturePanelForSection,
  adminCommunicationsPanelForSection,
  adminDataControlsPanelForSection,
  adminPostgresPanelForSection,
  adminServerPanelForSection,
  adminSyncsPanelForSection,
  adminTabForSection,
  isAdminArchitecturePanelId,
  isAdminCommunicationsPanelId,
  isAdminDataControlsPanelId,
  isAdminPostgresPanelId,
  isAdminPostgresSchemaHash,
  isAdminServerPanelId,
  isAdminSyncsPanelId,
  LEGACY_ADMIN_PANEL_TO_SYNCS,
  LEGACY_ADMIN_TAB_TO_ARCHITECTURE,
  LEGACY_ADMIN_TAB_TO_DATA_CONTROLS,
  type AdminTabId,
} from "@/lib/admin-nav";
const VALID_TABS = new Set<string>(ADMIN_TABS.map((t) => t.id));

function tabFromLocation(): AdminTabId {
  if (typeof window === "undefined") return "syncs";
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get("tab");
  if (queryTab && LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[queryTab]) {
    return "data-controls";
  }
  if (queryTab === "sync-log") return "syncs";
  // Former Database parent tab (deprecated) — destinations after URL normalize.
  if (queryTab === "db") {
    const panel = params.get("panel");
    if (panel === "town-counts" || panel === "postgres" || panel === "inventory") {
      return "postgres";
    }
    return "syncs";
  }
  if (queryTab && LEGACY_ADMIN_TAB_TO_ARCHITECTURE[queryTab]) {
    return "architecture";
  }
  if (queryTab && VALID_TABS.has(queryTab)) return queryTab as AdminTabId;
  const hash = window.location.hash.replace(/^#/, "");
  if (VALID_TABS.has(hash)) return hash as AdminTabId;
  // Deep-links into Postgres schema table cards → NEON Postgres
  if (isAdminPostgresSchemaHash(hash)) {
    return "postgres";
  }
  const sectionTab = adminTabForSection(hash);
  if (sectionTab) return sectionTab;
  return "syncs";
}

/** Rewrite legacy top-level tabs into nested ?tab=&panel= URLs. */
function normalizeLegacyNestedTabUrls() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const queryTab = url.searchParams.get("tab");
  const panel = url.searchParams.get("panel");
  if (!queryTab) return;

  const dataPanel = LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[queryTab];
  if (dataPanel) {
    url.searchParams.set("tab", "data-controls");
    url.searchParams.set("panel", dataPanel);
    window.history.replaceState(null, "", url);
    return;
  }

  if (queryTab === "sync-log") {
    url.searchParams.set("tab", "syncs");
    url.searchParams.set("panel", "history");
    window.history.replaceState(null, "", url);
    return;
  }

  // Former Database parent tab (deprecated) — split into Syncs / NEON.
  if (queryTab === "db") {
    if (panel === "town-counts") {
      url.searchParams.set("tab", "postgres");
      url.searchParams.set("panel", "town-counts");
    } else if (panel === "postgres") {
      url.searchParams.set("tab", "postgres");
      url.searchParams.set("panel", "schema");
    } else if (panel === "inventory") {
      url.searchParams.set("tab", "postgres");
      url.searchParams.set("panel", "inventory");
    } else if (panel && LEGACY_ADMIN_PANEL_TO_SYNCS[panel]) {
      url.searchParams.set("tab", "syncs");
      url.searchParams.set("panel", LEGACY_ADMIN_PANEL_TO_SYNCS[panel]!);
    } else {
      // rets-connection, bare ?tab=db, or unknown Database panels
      url.searchParams.set("tab", "syncs");
      url.searchParams.set("panel", "rets-connection");
    }
    window.history.replaceState(null, "", url);
    return;
  }

  const archPanel = LEGACY_ADMIN_TAB_TO_ARCHITECTURE[queryTab];
  if (archPanel) {
    url.searchParams.set("tab", "architecture");
    url.searchParams.set("panel", archPanel);
    window.history.replaceState(null, "", url);
    return;
  }

  // Former Data controls → Cookies nested panel is now a top-level tab.
  if (
    queryTab === "data-controls" &&
    url.searchParams.get("panel") === "cookies"
  ) {
    url.searchParams.set("tab", "cookies");
    url.searchParams.delete("panel");
    window.history.replaceState(null, "", url);
    return;
  }

  // Former Data controls → Page styles → Web server → Page styles.
  if (
    queryTab === "data-controls" &&
    url.searchParams.get("panel") === "page-styles"
  ) {
    url.searchParams.set("tab", "server");
    url.searchParams.set("panel", "page-styles");
    window.history.replaceState(null, "", url);
    return;
  }

  // Former Architecture → UI kit → Web server → UI kit.
  if (queryTab === "architecture" && panel === "ui-kit") {
    url.searchParams.set("tab", "server");
    url.searchParams.set("panel", "ui-kit");
    window.history.replaceState(null, "", url);
  }
}

function ensureNestedPanelParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const tab = url.searchParams.get("tab");
  const hash = url.hash.replace(/^#/, "");
  if (tab === "syncs") {
    if (isAdminSyncsPanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminSyncsPanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "dashboard");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "data-controls") {
    if (isAdminDataControlsPanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminDataControlsPanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "site");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "postgres") {
    if (isAdminPostgresPanelId(url.searchParams.get("panel"))) return;
    if (hash && isAdminPostgresSchemaHash(hash)) {
      url.searchParams.set("panel", "schema");
      window.history.replaceState(null, "", url);
      return;
    }
    const fromSection = hash ? adminPostgresPanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "schema");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "architecture") {
    if (isAdminArchitecturePanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminArchitecturePanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "map");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "communications") {
    if (isAdminCommunicationsPanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash
      ? adminCommunicationsPanelForSection(hash)
      : null;
    url.searchParams.set("panel", fromSection ?? "market-digest");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "server") {
    if (isAdminServerPanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminServerPanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "api-routes");
    window.history.replaceState(null, "", url);
  }
}

function scrollToSection(sectionId: string) {
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function AdminTabbedLayout({
  postgres,
  stats,
  traffic,
  visitors,
  dataControls,
  communications,
  cookies,
  architecture,
  syncs,
  r2,
  server,
  glossary,
  statusBar = null,
}: {
  postgres: ReactNode;
  stats: ReactNode;
  traffic: ReactNode;
  visitors: ReactNode;
  dataControls: ReactNode;
  communications: ReactNode;
  cookies: ReactNode;
  architecture: ReactNode;
  syncs: ReactNode;
  r2: ReactNode;
  server: ReactNode;
  glossary: ReactNode;
  /** Build and host / Database / Lambda strip rendered above the tab list. */
  statusBar?: ReactNode;
}) {
  const [tab, setTab] = useState<AdminTabId>("syncs");

  useEffect(() => {
    const syncFromLocation = () => {
      normalizeLegacyNestedTabUrls();
      ensureNestedPanelParam();
      setTab(tabFromLocation());
    };
    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  // After the active tab panel is shown, honor #section deep-links (e.g. schema tables).
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash === tab) return;
    const tryScroll = () => {
      if (document.getElementById(hash)) scrollToSection(hash);
    };
    tryScroll();
    const t = window.setTimeout(tryScroll, 80);
    return () => window.clearTimeout(t);
  }, [tab]);

  function selectTab(next: AdminTabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    if (next === "syncs") {
      if (!isAdminSyncsPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "dashboard");
      }
    } else if (next === "data-controls") {
      if (!isAdminDataControlsPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "site");
      }
    } else if (next === "postgres") {
      if (!isAdminPostgresPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "schema");
      }
    } else if (next === "architecture") {
      if (!isAdminArchitecturePanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "map");
      }
    } else if (next === "communications") {
      if (!isAdminCommunicationsPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "market-digest");
      }
    } else if (next === "server") {
      if (!isAdminServerPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "api-routes");
      }
    } else {
      url.searchParams.delete("panel");
    }
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminTabId, ReactNode> = {
    syncs,
    postgres,
    stats,
    traffic,
    visitors,
    "data-controls": dataControls,
    communications,
    cookies,
    architecture,
    r2,
    server,
    glossary,
  };
  const activeItem = ADMIN_TABS.find((item) => item.id === tab);

  return (
    <section className="bg-cream py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        {statusBar ? <div className="mb-4">{statusBar}</div> : null}
        {/* Underline tab bar — uniform height, active tab marked by a bottom border. */}
        <div
          role="tablist"
          aria-label="Admin areas"
          className="flex flex-row flex-wrap items-stretch gap-1 border-b border-charcoal/[0.12]"
        >
          {ADMIN_TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(item.id)}
                className={`shrink-0 -mb-px border-b-2 px-4 py-3 font-mono text-[11px] tracking-[0.16em] uppercase whitespace-nowrap transition-colors ${
                  active
                    ? "border-navy text-navy"
                    : "border-transparent text-charcoal/55 hover:border-charcoal/20 hover:text-navy"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {activeItem?.subtitle ? (
          <p className="mb-8 mt-2 text-xs leading-snug text-charcoal/60">
            {activeItem.subtitle}
          </p>
        ) : (
          <div className="mb-8" />
        )}

        {ADMIN_TABS.map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            hidden={tab !== item.id}
            className={tab === item.id ? "space-y-6" : undefined}
          >
            {panels[item.id]}
          </div>
        ))}

        <p className="mt-10 text-center font-mono text-[10px] tracking-[0.12em] text-charcoal/40">
          Tab URLs:{" "}
          {ADMIN_TABS.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? " · " : null}
              <Link href={`/admin?tab=${item.id}`} className="text-navy/60 hover:text-navy hover:underline">
                ?tab={item.id}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
