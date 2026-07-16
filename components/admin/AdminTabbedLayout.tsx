"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_TABS,
  adminTabForSection,
  type AdminTabId,
} from "@/lib/admin-nav";

const VALID_TABS = new Set<string>(ADMIN_TABS.map((t) => t.id));

function tabFromLocation(): AdminTabId {
  if (typeof window === "undefined") return "db";
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get("tab");
  if (queryTab && VALID_TABS.has(queryTab)) return queryTab as AdminTabId;
  const hash = window.location.hash.replace(/^#/, "");
  if (VALID_TABS.has(hash)) return hash as AdminTabId;
  const sectionTab = adminTabForSection(hash);
  if (sectionTab) return sectionTab;
  return "db";
}

function scrollToSection(sectionId: string) {
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function AdminTabbedLayout({
  db,
  site,
  goldilocks,
  rets,
  postgres,
  server,
  docs,
}: {
  db: ReactNode;
  site: ReactNode;
  goldilocks: ReactNode;
  rets: ReactNode;
  postgres: ReactNode;
  server: ReactNode;
  docs: ReactNode;
}) {
  const [tab, setTab] = useState<AdminTabId>("db");

  useEffect(() => {
    const syncFromLocation = () => {
      const nextTab = tabFromLocation();
      setTab(nextTab);
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && hash !== nextTab && document.getElementById(hash)) {
        scrollToSection(hash);
      }
    };
    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    return () => window.removeEventListener("hashchange", syncFromLocation);
  }, []);

  function selectTab(next: AdminTabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  const panels: Record<AdminTabId, ReactNode> = {
    db,
    site,
    goldilocks,
    rets,
    postgres,
    server,
    docs,
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
