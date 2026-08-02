"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
  SPOTLIGHT_PROPERTY_TABS,
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";
import {
  DEFAULT_SPOTLIGHT_TAB_ORDER,
  orderVisibleSpotlightTabs,
  SPOTLIGHT_ORDER_CHANGED_EVENT,
  type SpotlightOrderChangedDetail,
} from "@/lib/spotlight-tab-order-shared";

const POLL_MS = 18_000;
const BANNER_MS = 4_500;

/** Default before the visibility fetch resolves: slots with a hardcoded MLS id. */
const DEFAULT_VISIBLE_TABS: SpotlightPropertyTabId[] = orderVisibleSpotlightTabs(
  DEFAULT_SPOTLIGHT_TAB_ORDER,
  SPOTLIGHT_PROPERTY_TABS.filter((tab) =>
    Boolean(getSpotlightListingConfig(tab).mlsId),
  ),
);

type TabsPayload = {
  visibleTabs?: number[];
  order?: number[];
  version?: string;
};

function asTabIds(raw: number[] | undefined): SpotlightPropertyTabId[] {
  if (!raw?.length) return [];
  return raw.filter((t): t is SpotlightPropertyTabId =>
    SPOTLIGHT_PROPERTY_TABS.includes(t as SpotlightPropertyTabId),
  );
}

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

export function SpotlightPropertyTabs({
  lockedTab = null,
}: {
  /** When set, highlight this tab and disable navigation (e.g. `/test` mockup). */
  lockedTab?: SpotlightPropertyTabId | null;
} = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab =
    lockedTab ?? parseSpotlightPropertyTab(searchParams.get("property"));
  const [visibleTabs, setVisibleTabs] =
    useState<SpotlightPropertyTabId[]>(DEFAULT_VISIBLE_TABS);
  const [orderUpdating, setOrderUpdating] = useState(false);
  const versionRef = useRef<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const activeTabRef = useRef<HTMLElement | null>(null);

  const applyTabsPayload = useCallback(
    (d: TabsPayload | null, opts?: { announce?: boolean }) => {
      if (!d?.visibleTabs?.length) return;
      const nextVisible = asTabIds(d.visibleTabs);
      const nextOrder = asTabIds(d.order);
      const version = typeof d.version === "string" ? d.version : null;

      const versionChanged =
        version != null &&
        versionRef.current != null &&
        version !== versionRef.current;

      if (version != null) versionRef.current = version;

      setVisibleTabs(
        nextOrder.length > 0
          ? orderVisibleSpotlightTabs(nextOrder, nextVisible)
          : nextVisible,
      );

      if (opts?.announce && versionChanged && version) {
        setOrderUpdating(true);
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => {
          setOrderUpdating(false);
          bannerTimerRef.current = null;
        }, BANNER_MS);

        const detail: SpotlightOrderChangedDetail = {
          version,
          order: nextOrder.length > 0 ? nextOrder : DEFAULT_SPOTLIGHT_TAB_ORDER,
          visibleTabs: nextVisible,
        };
        window.dispatchEvent(
          new CustomEvent(SPOTLIGHT_ORDER_CHANGED_EVENT, { detail }),
        );
      }
    },
    [],
  );

  const fetchTabs = useCallback(
    (announce: boolean) => {
      void fetch("/api/spotlight/tabs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: TabsPayload | null) => {
          applyTabsPayload(d, { announce });
        })
        .catch(() => {});
    },
    [applyTabsPayload],
  );

  // Initial load (no banner) + poll / focus refresh.
  useEffect(() => {
    if (lockedTab != null) return;
    fetchTabs(false);

    const poll = window.setInterval(() => fetchTabs(true), POLL_MS);
    const onFocus = () => fetchTabs(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchTabs(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [lockedTab, fetchTabs]);

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
  }, [activeTab, visibleTabs]);

  // Always keep the active tab visible so a deep link never renders an empty rail.
  const tabsToRender = useMemo(() => {
    const set = new Set<SpotlightPropertyTabId>(visibleTabs);
    set.add(activeTab);
    const ordered = visibleTabs.filter((tab) => set.has(tab));
    if (!ordered.includes(activeTab)) {
      return orderVisibleSpotlightTabs(
        [...ordered, activeTab],
        [...set],
      );
    }
    return ordered;
  }, [visibleTabs, activeTab]);

  // A lone tab needs no property rail.
  if (tabsToRender.length <= 1 && !orderUpdating) return null;

  return (
    <div className="mb-1.5">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
        Spotlight Properties
      </p>
      {orderUpdating ? (
        <p
          className="mb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-white/55 transition-opacity duration-700"
          role="status"
          aria-live="polite"
        >
          Spotlight order updating…
        </p>
      ) : null}
      {tabsToRender.length > 1 ? (
        <div ref={viewportRef} className="overflow-hidden">
          <nav
            ref={stripRef}
            className="relative flex flex-nowrap gap-1 transition-transform duration-300 ease-out"
            aria-label="Spotlight properties"
          >
            {tabsToRender.map((tab) => {
              const isActive = activeTab === tab;
              const className = `min-w-[2.25rem] shrink-0 px-3 py-1.5 text-center font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
                isActive
                  ? "text-gold border-gold"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`;
              if (lockedTab != null) {
                return (
                  <span
                    key={tab}
                    ref={(node) => {
                      if (isActive) activeTabRef.current = node;
                    }}
                    className={`${className} ${isActive ? "" : "opacity-40"}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab}
                  </span>
                );
              }
              return (
                <Link
                  key={tab}
                  ref={(node) => {
                    if (isActive) activeTabRef.current = node;
                  }}
                  href={tabHref(pathname, searchParams, tab)}
                  className={className}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
