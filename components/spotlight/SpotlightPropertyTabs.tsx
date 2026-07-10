"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  parseSpotlightPropertyTab,
  SPOTLIGHT_PROPERTY_TABS,
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";

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

  return (
    <div className="mb-3">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Spotlight Properties
      </p>
      <nav className="flex gap-1" aria-label="Spotlight properties">
        {SPOTLIGHT_PROPERTY_TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Link
              key={tab}
              href={tabHref(pathname, searchParams, tab)}
              className={`min-w-[2.25rem] px-3 py-1.5 text-center font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
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
  );
}
