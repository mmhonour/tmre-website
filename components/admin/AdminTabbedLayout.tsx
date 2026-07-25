"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_TABS,
  adminDataControlsPanelForSection,
  adminDatabasePanelForSection,
  adminTabForSection,
  isAdminDataControlsPanelId,
  isAdminDatabasePanelId,
  LEGACY_ADMIN_TAB_TO_DATA_CONTROLS,
  LEGACY_ADMIN_TAB_TO_DATABASE,
  type AdminTabId,
} from "@/lib/admin-nav";

const VALID_TABS = new Set<string>(ADMIN_TABS.map((t) => t.id));

function tabFromLocation(): AdminTabId {
  if (typeof window === "undefined") return "db";
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get("tab");
  if (queryTab && LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[queryTab]) {
    return "data-controls";
  }
  if (queryTab && LEGACY_ADMIN_TAB_TO_DATABASE[queryTab]) {
    return "db";
  }
  if (queryTab && VALID_TABS.has(queryTab)) return queryTab as AdminTabId;
  const hash = window.location.hash.replace(/^#/, "");
  if (VALID_TABS.has(hash)) return hash as AdminTabId;
  // Deep-links into Postgres schema table cards
  if (
    hash.startsWith("schema-table-") ||
    hash === "admin-sqlite-schemas" ||
    hash === "postgres-listings"
  ) {
    return "postgres";
  }
  const sectionTab = adminTabForSection(hash);
  if (sectionTab) return sectionTab;
  return "db";
}

/** Rewrite legacy top-level tabs into nested ?tab=&panel= URLs. */
function normalizeLegacyNestedTabUrls() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const queryTab = url.searchParams.get("tab");
  if (!queryTab) return;

  const dataPanel = LEGACY_ADMIN_TAB_TO_DATA_CONTROLS[queryTab];
  if (dataPanel) {
    url.searchParams.set("tab", "data-controls");
    url.searchParams.set("panel", dataPanel);
    window.history.replaceState(null, "", url);
    return;
  }

  const dbPanel = LEGACY_ADMIN_TAB_TO_DATABASE[queryTab];
  if (dbPanel) {
    url.searchParams.set("tab", "db");
    url.searchParams.set("panel", dbPanel);
    window.history.replaceState(null, "", url);
  }
}

function ensureNestedPanelParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const tab = url.searchParams.get("tab");
  const hash = url.hash.replace(/^#/, "");
  if (tab === "data-controls") {
    if (isAdminDataControlsPanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminDataControlsPanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "site");
    window.history.replaceState(null, "", url);
    return;
  }
  if (tab === "db") {
    if (isAdminDatabasePanelId(url.searchParams.get("panel"))) return;
    const fromSection = hash ? adminDatabasePanelForSection(hash) : null;
    url.searchParams.set("panel", fromSection ?? "rets-connection");
    window.history.replaceState(null, "", url);
  }
}

function scrollToSection(sectionId: string) {
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function AdminTabbedLayout({
  db,
  stats,
  dataControls,
  architecture,
  rets,
  postgres,
  syncs,
  server,
  docs,
  glossary,
}: {
  db: ReactNode;
  stats: ReactNode;
  dataControls: ReactNode;
  architecture: ReactNode;
  rets: ReactNode;
  postgres: ReactNode;
  syncs: ReactNode;
  server: ReactNode;
  docs: ReactNode;
  glossary: ReactNode;
}) {
  const [tab, setTab] = useState<AdminTabId>("db");

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
    if (next === "data-controls") {
      if (!isAdminDataControlsPanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "site");
      }
    } else if (next === "db") {
      if (!isAdminDatabasePanelId(url.searchParams.get("panel"))) {
        url.searchParams.set("panel", "rets-connection");
      }
    } else {
      url.searchParams.delete("panel");
    }
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminTabId, ReactNode> = {
    db,
    stats,
    "data-controls": dataControls,
    architecture,
    rets,
    postgres,
    syncs,
    server,
    docs,
    glossary,
  };
  const activeItem = ADMIN_TABS.find((item) => item.id === tab);

  return (
    <section className="bg-cream py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
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
