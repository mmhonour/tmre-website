"use client";

import {
  filterPillPromotedContainerClass,
  filterPillPromotedLinksClass,
  filterPillZipButtonClass,
  filterPillZipLinkClass,
  filterPillZipLinkUnderlineClass,
} from "@/lib/filter-pill-styles";
import { zipAreaNickname } from "@/lib/tmre-towns";

type ZipFilterPillsProps = {
  zips: readonly string[];
  selected: string | null;
  onSelect: (zip: string | null) => void;
  counts: ReadonlyMap<string, number> | Partial<Record<string, number>>;
  allCount: number;
  allLabel?: string;
  townName?: string;
  zipLinksExpanded?: boolean;
  onZipLinksExpandedChange?: (expanded: boolean) => void;
  onZipMouseEnter?: (zip: string, el: HTMLElement) => void;
  onZipMouseLeave?: () => void;
  className?: string;
  /** Beside town pills on one row — drop full-width stretch. */
  promotedInline?: boolean;
};

function zipCount(counts: ZipFilterPillsProps["counts"], zip: string): number | undefined {
  if (counts instanceof Map) return counts.get(zip);
  return (counts as Partial<Record<string, number>>)[zip];
}

function ZipCountBadge({
  count,
  active,
  variant = "pill",
}: {
  count: number;
  active: boolean;
  variant?: "pill" | "link";
}) {
  const inactiveTone = variant === "link" ? "text-white/35" : "text-white/40";
  const activeTone = variant === "link" ? "text-gold/65" : "text-navy/55";
  return (
    <span
      className={`ml-1 font-mono tabular-nums text-[9px] ${
        active ? activeTone : inactiveTone
      } ${variant === "link" ? "no-underline" : ""}`}
      aria-label={`${count.toLocaleString()} listings`}
    >
      {variant === "link" ? `(${count.toLocaleString()})` : count.toLocaleString()}
    </span>
  );
}

function ZipPillLabel({ zip, active }: { zip: string; active: boolean }) {
  const areaName = zipAreaNickname(zip);
  return (
    <>
      {zip}
      {areaName ? (
        <span
          className={`ml-1 normal-case tracking-normal ${
            active ? "text-navy/70" : "text-white/75"
          }`}
        >
          · {areaName}
        </span>
      ) : null}
    </>
  );
}

function ZipLinkLabel({ zip, active }: { zip: string; active: boolean }) {
  const areaName = zipAreaNickname(zip);
  const label = areaName ? `${zip} · ${areaName}` : zip;
  return <span className={filterPillZipLinkUnderlineClass(active)}>{label}</span>;
}

export default function ZipFilterPills({
  zips,
  selected,
  onSelect,
  counts,
  allCount,
  allLabel = "All",
  townName,
  zipLinksExpanded = false,
  onZipLinksExpandedChange,
  onZipMouseEnter,
  onZipMouseLeave,
  className = "",
  promotedInline = false,
}: ZipFilterPillsProps) {
  const allActive = selected === null;
  const selectedZip = allActive ? null : selected;
  const showPromotedLinks = zipLinksExpanded;

  const moreZipsLabel = townName
    ? `... more zips for ${townName}`
    : "... more zips";

  const moreZipsButton = !zipLinksExpanded ? (
    <button
      type="button"
      aria-label={townName ? `Show more zip codes for ${townName}` : "Show more zip codes"}
      aria-expanded={false}
      onClick={() => onZipLinksExpandedChange?.(true)}
      className="font-mono text-xs leading-none text-white/55 hover:text-gold px-1 py-1.5 transition-colors whitespace-nowrap cursor-pointer"
    >
      {moreZipsLabel}
    </button>
  ) : null;

  const renderZipLink = (zip: string, active: boolean) => {
    const count = zipCount(counts, zip) ?? 0;
    return (
      <button
        key={zip}
        type="button"
        onClick={() => onSelect(zip)}
        onMouseEnter={(e) => onZipMouseEnter?.(zip, e.currentTarget)}
        onMouseLeave={onZipMouseLeave}
        aria-pressed={active}
        className={filterPillZipLinkClass(active)}
      >
        <ZipLinkLabel zip={zip} active={active} />
        <ZipCountBadge count={count} active={active} variant="link" />
      </button>
    );
  };

  return (
    <div className={className}>
      <div
        className={filterPillPromotedContainerClass(promotedInline)}
        onMouseLeave={onZipMouseLeave}
      >
        {allActive ? (
          <>
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-pressed
              className={filterPillZipButtonClass(true, true)}
            >
              {allLabel}
              <ZipCountBadge count={allCount} active variant="pill" />
            </button>
            {moreZipsButton}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelect(selectedZip!)}
              onMouseEnter={(e) => onZipMouseEnter?.(selectedZip!, e.currentTarget)}
              onMouseLeave={onZipMouseLeave}
              aria-pressed
              className={filterPillZipButtonClass(true, false)}
            >
              <ZipPillLabel zip={selectedZip!} active />
              <ZipCountBadge count={zipCount(counts, selectedZip!) ?? 0} active variant="pill" />
            </button>
            {moreZipsButton}
          </>
        )}
        {showPromotedLinks ? (
          <div className={filterPillPromotedLinksClass()}>
            {!allActive ? (
              <button
                type="button"
                onClick={() => onSelect(null)}
                aria-pressed={false}
                className={filterPillZipLinkClass(false)}
              >
                <span className={filterPillZipLinkUnderlineClass(false)}>{allLabel}</span>
                <ZipCountBadge count={allCount} active={false} variant="link" />
              </button>
            ) : null}
            {zips
              .filter((zip) => allActive || zip !== selectedZip)
              .map((zip) => renderZipLink(zip, false))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
