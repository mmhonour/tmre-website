"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_SECTION_LINKS,
  ADMIN_TABS,
  adminTabForSection,
  type AdminTabId,
} from "@/lib/admin-nav";

const VALID_TABS = new Set<string>(["db", "server", "site", "docs", "rets"]);

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
  server,
  docs,
  site,
  rets,
}: {
  db: ReactNode;
  server: ReactNode;
  docs: ReactNode;
  site: ReactNode;
  rets: ReactNode;
}) {
  const [tab, setTab] = useState<AdminTabId>("db");

  const jumpTo = useCallback((sectionId: string, nextTab: AdminTabId) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.hash = sectionId;
    window.history.replaceState(null, "", url);
    scrollToSection(sectionId);
  }, []);

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

  const panels: Record<AdminTabId, ReactNode> = { db, server, docs, site, rets };

  return (
    <section className="bg-cream py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <nav
          aria-label="Admin sections"
          className="mb-6 overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-3 shadow-sm shadow-charcoal/[0.04]"
        >
          <p className="mb-2 font-mono text-[10px] tracking-[0.18em] uppercase text-gold">
            Jump to
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {ADMIN_SECTION_LINKS.map((link) => (
              <li key={link.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(link.id, link.tab)}
                  className="font-mono text-[11px] tracking-[0.08em] text-navy/75 underline-offset-2 hover:text-navy hover:underline"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Single-row tab bar — inactive tabs show label only; active tab expands with subtitle */}
        <div
          role="tablist"
          aria-label="Admin areas"
          className="mb-8 flex flex-row items-start gap-2 overflow-x-auto pb-0.5"
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
                className={`shrink-0 rounded-2xl border px-4 text-left transition-all duration-150 ${
                  active
                    ? "py-3 border-navy bg-navy text-white shadow-sm"
                    : "py-2.5 border-charcoal/[0.08] bg-white text-charcoal hover:border-gold/35"
                }`}
              >
                <span className="block font-mono text-[11px] tracking-[0.16em] uppercase whitespace-nowrap">
                  {item.label}
                </span>
                {active && (
                  <span className="mt-1 block text-xs leading-snug text-white/70 max-w-[18rem]">
                    {item.subtitle}
                  </span>
                )}
              </button>
            );
          })}
        </div>

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
