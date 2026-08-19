import Link from "next/link";

export type ExplorePageTab = "latest" | "closed";

const TABS: readonly {
  id: ExplorePageTab;
  href: `/${ExplorePageTab}`;
  label: string;
}[] = [
  { id: "latest", href: "/latest", label: "Latest" },
  { id: "closed", href: "/closed", label: "Closed" },
];

/**
 * Same folder-tab treatment as MarketsPageTabs — gold fill + navy
 * label when selected. Ties /latest and /closed.
 */
function folderTabClass(active: boolean): string {
  const base =
    "relative shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase transition-colors rounded-t-md border -mb-px";
  if (active) {
    return `${base} z-[1] border-gold border-b-transparent bg-gold text-navy`;
  }
  return `${base} border-transparent text-white/45 hover:text-white/75`;
}

export default function ExplorePageTabs({
  active,
}: {
  active: ExplorePageTab;
}) {
  return (
    <div className="mt-4 lg:mt-6 animate-fade-up-delay-2">
      <div
        role="tablist"
        aria-label="Explore listing pages"
        className="flex items-end gap-0.5"
      >
        {TABS.map((tab) => {
          const on = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={on}
              aria-current={on ? "page" : undefined}
              className={folderTabClass(on)}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="border-b border-white/15" aria-hidden />
    </div>
  );
}
