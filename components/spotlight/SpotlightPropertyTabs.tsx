"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { SpotlightPropertyTabId } from "@/lib/spotlight-listing";

function tabHref(
  pathname: string,
  searchParams: URLSearchParams,
  tab: SpotlightPropertyTabId,
): string {
  const params = new URLSearchParams(searchParams.toString());
  if (tab === 1) {
    params.delete("property");
  } else {
    params.set("property", "2");
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function SpotlightPropertyTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab: SpotlightPropertyTabId =
    searchParams.get("property") === "2" ? 2 : 1;

  const tabs: SpotlightPropertyTabId[] = [1, 2];

  return (
    <nav
      className="mb-3 flex gap-1"
      aria-label="Spotlight properties"
    >
      {tabs.map((tab) => {
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
  );
}
