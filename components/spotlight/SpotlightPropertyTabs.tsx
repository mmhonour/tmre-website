"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
  SPOTLIGHT_PROPERTY_TABS,
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";

/** Default before the visibility fetch resolves: slots with a hardcoded MLS id. */
const DEFAULT_VISIBLE_TABS: SpotlightPropertyTabId[] = SPOTLIGHT_PROPERTY_TABS.filter(
  (tab) => Boolean(getSpotlightListingConfig(tab).mlsId),
);

function tabHref(
  pathname: string,
  searchParams: URLSearchParams,
  tab: SpotlightPropertyTabId,
): string {
  const params = new URLSearchParams(searchParams.toString());
  const property = spotlightPropertySearchParam(tab);
  if (property) {
    params.set("property", property);
  } else {
    params.delete("property");
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function SpotlightPropertyTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = parseSpotlightPropertyTab(searchParams.get("property"));
  const [visibleTabs, setVisibleTabs] =
    useState<SpotlightPropertyTabId[]>(DEFAULT_VISIBLE_TABS);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // No scrollbar: clip the rail and slide it via transform so the active tab
  // stays centered/visible, moving about one tab at a time.
  useEffect(() => {
    const viewport = viewportRef.current;
    const strip = stripRef.current;
    const el = activeTabRef.current;
    if (!viewport || !strip || !el) return;
    const reposition = () => {
      const maxOffset = Math.max(0, strip.scrollWidth - viewport.clientWidth);
      const desired =
        el.offsetLeft + el.clientWidth / 2 - viewport.clientWidth / 2;
      const offset = Math.min(Math.max(0, desired), maxOffset);
      strip.style.transform = `translateX(${-offset}px)`;
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/spotlight/tabs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { visibleTabs?: number[] } | null) => {
        if (cancelled || !d?.visibleTabs) return;
        setVisibleTabs(
          d.visibleTabs.filter((t): t is SpotlightPropertyTabId =>
            SPOTLIGHT_PROPERTY_TABS.includes(t as SpotlightPropertyTabId),
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Always keep the active tab visible so a deep link never renders an empty rail.
  const tabsToRender = useMemo(() => {
    const set = new Set<SpotlightPropertyTabId>(visibleTabs);
    set.add(activeTab);
    return SPOTLIGHT_PROPERTY_TABS.filter((tab) => set.has(tab));
  }, [visibleTabs, activeTab]);

  // A lone tab needs no property rail.
  if (tabsToRender.length <= 1) return null;

  return (
    <div className="mb-1.5">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
        Spotlight Properties
      </p>
      <div ref={viewportRef} className="overflow-hidden">
      <nav
        ref={stripRef}
        className="relative flex flex-nowrap gap-1 transition-transform duration-300 ease-out"
        aria-label="Spotlight properties"
      >
        {tabsToRender.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Link
              key={tab}
              ref={isActive ? activeTabRef : undefined}
              href={tabHref(pathname, searchParams, tab)}
              className={`min-w-[2.25rem] shrink-0 px-3 py-1.5 text-center font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
                isActive
                  ? "text-gold border-gold"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {tab}
            </Link>
          );
        })}
      </nav>
      </div>
    </div>
  );
}
