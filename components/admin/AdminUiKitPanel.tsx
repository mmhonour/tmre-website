"use client";

import { useState, type ReactNode } from "react";
import {
  ADMIN_TAB_KIT,
  adminTabKitGroups,
  type AdminTabKitEntry,
} from "@/lib/admin-tab-kit";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillIndependentButtonClass,
  filterPillIndependentContainerClass,
  filterPillPromotedContainerClass,
  filterPillPromotedLinksClass,
  filterPillSeparatorClass,
  filterPillZipButtonClass,
  filterPillZipContainerClass,
  filterPillZipLinkClass,
  filterPillZipLinkUnderlineClass,
} from "@/lib/filter-pill-styles";

const SAMPLE_OPTS = ["One", "Two", "Three"] as const;

function Surface({
  surface,
  children,
  className = "",
}: {
  surface: "dark" | "light";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-4 ${
        surface === "dark"
          ? "bg-navy text-white"
          : "bg-cream border border-charcoal/[0.08] text-navy"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function SegmentedDemo({
  size,
  theme,
  bordered = true,
  withSep = false,
}: {
  size: "default" | "compact";
  theme: "dark" | "light";
  bordered?: boolean;
  withSep?: boolean;
}) {
  const [active, setActive] = useState(0);
  if (withSep) {
    return (
      <div
        className={filterPillContainerClass(size, { theme, bordered })}
        role="tablist"
      >
        {SAMPLE_OPTS.slice(0, 2).map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={active === i}
            className={filterPillButtonClass(active === i, size, theme)}
            onClick={() => setActive(i)}
          >
            {label}
          </button>
        ))}
        <span
          className={filterPillSeparatorClass(size, theme)}
          aria-hidden
        />
        {SAMPLE_OPTS.slice(2).map((label, i) => {
          const idx = i + 2;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={active === idx}
              className={filterPillButtonClass(active === idx, size, theme)}
              onClick={() => setActive(idx)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className={filterPillContainerClass(size, { theme, bordered })}
      role="tablist"
    >
      {SAMPLE_OPTS.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={filterPillButtonClass(active === i, size, theme)}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function IndependentDemo({ theme }: { theme: "dark" | "light" }) {
  const [active, setActive] = useState(0);
  return (
    <div
      className={filterPillIndependentContainerClass("compact")}
      role="tablist"
    >
      {["Sale", "Rent"].map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={filterPillIndependentButtonClass(
            active === i,
            "compact",
            theme,
          )}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ZipButtonDemo() {
  const [active, setActive] = useState("all");
  const opts = [
    { id: "all", label: "All", isAll: true },
    { id: "06880", label: "06880", isAll: false },
    { id: "06840", label: "06840", isAll: false },
  ];
  return (
    <div className={filterPillZipContainerClass()} role="tablist">
      {opts.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={active === opt.id}
          className={filterPillZipButtonClass(active === opt.id, opt.isAll)}
          onClick={() => setActive(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ZipLinkDemo() {
  const [active, setActive] = useState("westport");
  const opts = [
    { id: "all", label: "All" },
    { id: "westport", label: "Westport" },
    { id: "wilton", label: "Wilton" },
  ];
  return (
    <div className={filterPillPromotedContainerClass()}>
      <div className={filterPillPromotedLinksClass()} role="tablist">
        {opts.map((opt) => {
          const on = active === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={filterPillZipLinkClass(on)}
              onClick={() => setActive(opt.id)}
            >
              <span className={filterPillZipLinkUnderlineClass(on)}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UnderlineListingDemo() {
  const [active, setActive] = useState(0);
  const tabs = ["Overview", "Photos", "Comps", "What if"];
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 border-b border-white/15"
    >
      {tabs.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={`shrink-0 whitespace-nowrap px-3 py-2 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
            active === i
              ? "text-gold border-gold"
              : "text-white/50 border-transparent hover:text-white/80"
          }`}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function UnderlineAdminPrimaryDemo() {
  const [active, setActive] = useState(0);
  const tabs = ["Syncs", "Visitors", "Architecture"];
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 border-b border-charcoal/[0.12]"
    >
      {tabs.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={`shrink-0 -mb-px border-b-2 px-4 py-3 font-mono text-[11px] tracking-[0.16em] uppercase whitespace-nowrap transition-colors ${
            active === i
              ? "border-navy text-navy"
              : "border-transparent text-charcoal/55 hover:border-charcoal/20 hover:text-navy"
          }`}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function UnderlineAdminNestedDemo() {
  const [active, setActive] = useState(0);
  const tabs = ["Dashboard", "Configure", "UI kit"];
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 border-b border-charcoal/[0.1]"
    >
      {tabs.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={`shrink-0 -mb-px border-b-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors ${
            active === i
              ? "border-gold text-navy"
              : "border-transparent text-charcoal/50 hover:border-charcoal/15 hover:text-navy"
          }`}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EdgeListingDemo() {
  const [active, setActive] = useState("insight");
  const pills = ["Insight", "Details", "What if", "Map"] as const;
  return (
    <div className="relative min-h-[9rem]">
      <div
        className="absolute right-0 top-2 flex flex-col items-end gap-0"
        role="toolbar"
        aria-label="Listing panels (preview)"
      >
        {pills.map((label) => {
          const key = label === "What if" ? "what-if" : label.toLowerCase();
          return (
            <button
              key={label}
              type="button"
              className={`inline-flex w-fit items-center justify-end rounded-l-full rounded-r-none border border-r-0 pl-3.5 pr-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] shadow-[-4px_2px_12px_-4px_rgba(0,0,0,0.55)] transition-colors ${
                active === key
                  ? "border-gold bg-navy text-gold"
                  : "border-gold/45 bg-[#121c2e]/95 text-gold/90 hover:border-gold hover:bg-navy hover:text-gold"
              }`}
              aria-pressed={active === key}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="pr-24 pt-2 text-xs text-white/50">
        Preview stack (mobile only in production) · active: {active}
      </p>
    </div>
  );
}

function FolderCompsDemo() {
  const [active, setActive] = useState<"closed" | "active">("closed");
  const tabClass = (on: boolean) => {
    const base =
      "relative shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase transition-colors rounded-t-md border -mb-px";
    if (on) {
      return `${base} z-[1] border-gold border-b-transparent bg-gold text-navy`;
    }
    return `${base} border-transparent text-white/45 hover:text-white/75`;
  };
  return (
    <div>
      <div role="tablist" className="flex items-end gap-0.5">
        <button
          type="button"
          role="tab"
          aria-selected={active === "closed"}
          className={tabClass(active === "closed")}
          onClick={() => setActive("closed")}
        >
          Sold (12)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "active"}
          className={tabClass(active === "active")}
          onClick={() => setActive("active")}
        >
          On the market (4)
        </button>
      </div>
      <div className="rounded-b-lg rounded-tr-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white/55">
        {active === "closed" ? "Sold comps pane" : "On-the-market comps pane"}
      </div>
    </div>
  );
}

function StatusDealBoardDemo() {
  const [active, setActive] = useState(0);
  const opts = ["All", "New", "Reduced", "Active"];
  return (
    <div
      className={filterPillContainerClass("compact", { theme: "dark" })}
      role="tablist"
    >
      {opts.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={filterPillButtonClass(active === i, "compact", "dark")}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StatusLatestDemo() {
  const chips = [
    { label: "New", className: "bg-sage/15 text-sage border-sage/30" },
    { label: "Reduced", className: "bg-coral/15 text-coral border-coral/30" },
    { label: "Increased", className: "bg-gold/15 text-navy border-gold/40" },
    {
      label: "Coming Soon",
      className: "bg-navy/10 text-navy border-navy/20",
    },
  ];
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase ${chip.className}`}
        >
          {chip.label}
        </li>
      ))}
    </ul>
  );
}

function PreviewForId({ id }: { id: string }) {
  switch (id) {
    case "pill-seg-dark-default":
      return <SegmentedDemo size="default" theme="dark" />;
    case "pill-seg-dark-compact":
      return <SegmentedDemo size="compact" theme="dark" />;
    case "pill-seg-light-default":
      return <SegmentedDemo size="default" theme="light" />;
    case "pill-seg-light-compact":
      return <SegmentedDemo size="compact" theme="light" />;
    case "pill-seg-dark-compact-sep":
      return <SegmentedDemo size="compact" theme="dark" withSep />;
    case "pill-seg-unbordered-compact":
      return <SegmentedDemo size="compact" theme="dark" bordered={false} />;
    case "pill-ind-dark-compact":
      return <IndependentDemo theme="dark" />;
    case "pill-ind-light-compact":
      return <IndependentDemo theme="light" />;
    case "pill-zip-button":
      return <ZipButtonDemo />;
    case "pill-zip-link":
      return <ZipLinkDemo />;
    case "underline-listing":
      return <UnderlineListingDemo />;
    case "underline-admin-primary":
      return <UnderlineAdminPrimaryDemo />;
    case "underline-admin-nested":
      return <UnderlineAdminNestedDemo />;
    case "edge-listing-mobile":
      return <EdgeListingDemo />;
    case "folder-comps-mobile":
      return <FolderCompsDemo />;
    case "status-deal-board":
      return <StatusDealBoardDemo />;
    case "status-latest":
      return <StatusLatestDemo />;
    default:
      return (
        <p className="text-xs text-charcoal/50">No preview wired for {id}</p>
      );
  }
}

function KitCard({ entry }: { entry: AdminTabKitEntry }) {
  const viewportLabel =
    entry.viewport === "both"
      ? "Desktop + mobile"
      : entry.viewport === "desktop"
        ? "Desktop-focused"
        : "Mobile-only";

  return (
    <article
      id={`tab-kit-${entry.id}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/30 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold">
            {entry.id}
          </p>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
            {viewportLabel}
          </p>
        </div>
        <p className="mt-1 text-sm font-medium text-navy">{entry.title}</p>
        <p className="mt-1 text-xs text-slate">{entry.where}</p>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <Surface surface={entry.surface}>
          <PreviewForId id={entry.id} />
        </Surface>
        <p className="mt-3 text-xs leading-relaxed text-charcoal/55">
          {entry.note}
        </p>
      </div>
    </article>
  );
}

/**
 * Live catalog of every distinct tab/pill visual system with stable IDs.
 * Deep link: /admin?tab=server&panel=ui-kit
 */
export default function AdminUiKitPanel() {
  const groups = adminTabKitGroups();

  return (
    <div id="admin-ui-kit" className="scroll-mt-24 space-y-8">
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          UI kit — tab styles
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate">
          Live previews of each tab / pill system used across the site. Click
          samples to toggle active state. IDs are stable for design chat — reuse
          the same helpers so Admin matches production.
        </p>
        <p className="mt-3 font-mono text-[10px] text-charcoal/45">
          {ADMIN_TAB_KIT.length} styles · {groups.length} groups
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {ADMIN_TAB_KIT.map((row) => (
            <li key={row.id}>
              <a
                href={`#tab-kit-${row.id}`}
                className="font-mono text-[10px] tracking-[0.08em] text-navy underline decoration-navy/20 underline-offset-2 hover:decoration-navy"
              >
                {row.id}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {groups.map((group) => (
        <section key={group} className="space-y-4">
          <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal/45">
            {group}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {ADMIN_TAB_KIT.filter((row) => row.group === group).map((row) => (
              <KitCard key={row.id} entry={row} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
