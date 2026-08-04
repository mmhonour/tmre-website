"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ADMIN_TAB_KIT,
  adminTabKitGroups,
  type AdminTabKitEntry,
  type AdminTabKitId,
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
import {
  previewSampleForRole,
  type TabKitPreviewSample,
} from "@/lib/admin-tab-kit-preview-samples";
import { dispatchTabKitAssignmentsChanged } from "@/lib/tab-kit-events";
import {
  defaultTabKitAssignments,
  type TabKitAssignments,
} from "@/lib/tab-kit-assignments-shared";

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
  labels,
  labelGroups,
}: {
  size: "default" | "compact";
  theme: "dark" | "light";
  bordered?: boolean;
  withSep?: boolean;
  labels: string[];
  labelGroups?: string[][];
}) {
  const [active, setActive] = useState(0);
  const groups =
    withSep && labelGroups && labelGroups.length > 0
      ? labelGroups
      : withSep && labels.length > 3
        ? [labels.slice(0, 3), labels.slice(3)]
        : null;

  if (groups) {
    let offset = 0;
    return (
      <div
        className={filterPillContainerClass(size, { theme, bordered })}
        role="tablist"
      >
        {groups.map((group, gi) => {
          const start = offset;
          offset += group.length;
          return (
            <span key={`g-${gi}`} className="contents">
              {gi > 0 ? (
                <span
                  className={filterPillSeparatorClass(size, theme)}
                  aria-hidden
                />
              ) : null}
              {group.map((label, i) => {
                const idx = start + i;
                return (
                  <button
                    key={`${label}-${idx}`}
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
            </span>
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
      {labels.map((label, i) => (
        <button
          key={`${label}-${i}`}
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

function IndependentDemo({
  theme,
  labels,
}: {
  theme: "dark" | "light";
  labels: string[];
}) {
  const [active, setActive] = useState(0);
  const opts = labels.length > 0 ? labels : ["Sale", "Rent"];
  return (
    <div
      className={filterPillIndependentContainerClass("compact")}
      role="tablist"
    >
      {opts.map((label, i) => (
        <button
          key={`${label}-${i}`}
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

function ZipButtonDemo({ sample }: { sample: TabKitPreviewSample }) {
  const opts =
    sample.zipButtons ??
    sample.labels.map((label, i) => ({
      id: `${label}-${i}`,
      label,
      isAll: i === 0 || label.toLowerCase() === "all",
    }));
  const [active, setActive] = useState(opts[0]?.id ?? "all");
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

function ZipLinkDemo({ sample }: { sample: TabKitPreviewSample }) {
  const opts =
    sample.zipLinks ??
    sample.labels.map((label, i) => ({
      id: `${label}-${i}`,
      label,
    }));
  const [active, setActive] = useState(opts[0]?.id ?? "all");
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

function UnderlineDemo({
  labels,
  variant,
}: {
  labels: string[];
  variant: "listing" | "admin-primary" | "admin-nested";
}) {
  const [active, setActive] = useState(0);
  const bar =
    variant === "listing"
      ? "flex flex-wrap gap-1 border-b border-white/15"
      : variant === "admin-primary"
        ? "flex flex-wrap gap-1 border-b border-charcoal/[0.12]"
        : "flex flex-wrap gap-1 border-b border-charcoal/[0.1]";
  const tabClass = (on: boolean) => {
    if (variant === "listing") {
      return `shrink-0 whitespace-nowrap px-3 py-2 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
        on
          ? "text-gold border-gold"
          : "text-white/50 border-transparent hover:text-white/80"
      }`;
    }
    if (variant === "admin-primary") {
      return `shrink-0 -mb-px border-b-2 px-4 py-3 font-mono text-[11px] tracking-[0.16em] uppercase whitespace-nowrap transition-colors ${
        on
          ? "border-navy text-navy"
          : "border-transparent text-charcoal/55 hover:border-charcoal/20 hover:text-navy"
      }`;
    }
    return `shrink-0 -mb-px border-b-2 px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors ${
      on
        ? "border-gold text-navy"
        : "border-transparent text-charcoal/50 hover:border-charcoal/15 hover:text-navy"
    }`;
  };
  return (
    <div role="tablist" className={bar}>
      {labels.map((label, i) => (
        <button
          key={`${label}-${i}`}
          type="button"
          role="tab"
          aria-selected={active === i}
          className={tabClass(active === i)}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EdgeListingDemo({ labels }: { labels: string[] }) {
  const pills = labels.length > 0 ? labels : ["Insight", "Details", "What if", "Map"];
  const [active, setActive] = useState(
    pills[0] === "What if" ? "what-if" : pills[0]!.toLowerCase(),
  );
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

function FolderCompsDemo({ labels }: { labels: string[] }) {
  const tabs =
    labels.length >= 2
      ? labels
      : ["Sold (12)", "On the market (4)"];
  const [active, setActive] = useState(0);
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
        {tabs.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            role="tab"
            aria-selected={active === i}
            className={tabClass(active === i)}
            onClick={() => setActive(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-b-lg rounded-tr-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white/55">
        {tabs[active] ?? "Pane"}
      </div>
    </div>
  );
}

function StatusLatestDemo({ sample }: { sample: TabKitPreviewSample }) {
  const chips =
    sample.statusChips ??
    sample.labels.map((label) => ({
      label,
      className: "bg-navy/10 text-navy border-navy/20",
    }));
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

/**
 * Paint `styleId` visuals using `sample` labels from the source surface.
 * Remaps change chrome only — source labels are preserved.
 */
function PreviewForStyle({
  styleId,
  sample,
}: {
  styleId: string;
  sample: TabKitPreviewSample;
}) {
  const labels = sample.labels;
  switch (styleId) {
    case "pill-seg-dark-default":
      return (
        <SegmentedDemo size="default" theme="dark" labels={labels} />
      );
    case "pill-seg-dark-compact":
      return (
        <SegmentedDemo size="compact" theme="dark" labels={labels} />
      );
    case "pill-seg-light-default":
      return (
        <SegmentedDemo size="default" theme="light" labels={labels} />
      );
    case "pill-seg-light-compact":
      return (
        <SegmentedDemo size="compact" theme="light" labels={labels} />
      );
    case "pill-seg-dark-compact-sep":
      return (
        <SegmentedDemo
          size="compact"
          theme="dark"
          withSep
          labels={labels}
          labelGroups={sample.labelGroups}
        />
      );
    case "pill-seg-unbordered-compact":
      return (
        <SegmentedDemo
          size="compact"
          theme="dark"
          bordered={false}
          labels={labels}
        />
      );
    case "pill-ind-dark-compact":
      return <IndependentDemo theme="dark" labels={labels} />;
    case "pill-ind-light-compact":
      return <IndependentDemo theme="light" labels={labels} />;
    case "pill-zip-button":
      return <ZipButtonDemo sample={sample} />;
    case "pill-zip-link":
      return <ZipLinkDemo sample={sample} />;
    case "underline-listing":
      return <UnderlineDemo labels={labels} variant="listing" />;
    case "underline-admin-primary":
      return <UnderlineDemo labels={labels} variant="admin-primary" />;
    case "underline-admin-nested":
      return <UnderlineDemo labels={labels} variant="admin-nested" />;
    case "edge-listing-mobile":
      return (
        <EdgeListingDemo labels={sample.edgePills ?? labels} />
      );
    case "folder-comps-mobile":
      return (
        <FolderCompsDemo labels={sample.folderTabs ?? labels} />
      );
    case "status-deal-board":
      return (
        <SegmentedDemo size="compact" theme="dark" labels={labels} />
      );
    case "status-latest":
      return <StatusLatestDemo sample={sample} />;
    default:
      return (
        <p className="text-xs text-charcoal/50">
          No preview wired for {styleId}
        </p>
      );
  }
}

function kitEntryById(id: string): AdminTabKitEntry | undefined {
  return ADMIN_TAB_KIT.find((row) => row.id === id);
}

function viewportLabel(entry: AdminTabKitEntry): string {
  return entry.viewport === "both"
    ? "Desktop + mobile"
    : entry.viewport === "desktop"
      ? "Desktop-focused"
      : "Mobile-only";
}

function KitCard({
  entry,
  savedKitId,
  saving,
  onSave,
}: {
  entry: AdminTabKitEntry;
  /** Persisted assignment for this role. */
  savedKitId: AdminTabKitId;
  saving: boolean;
  onSave: (kitId: AdminTabKitId) => Promise<boolean>;
}) {
  const [draftKitId, setDraftKitId] = useState<AdminTabKitId>(savedKitId);
  const [rowMessage, setRowMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftKitId(savedKitId);
  }, [savedKitId]);

  const ownKitId = entry.id as AdminTabKitId;
  /** Source-surface labels — After preview keeps these; only chrome changes. */
  const sourceSample = previewSampleForRole(entry.id);
  const draftEntry = kitEntryById(draftKitId) ?? entry;
  const dirty = draftKitId !== savedKitId;
  const liveRemapped = savedKitId !== ownKitId;
  const draftRemapped = draftKitId !== ownKitId;
  /** Draft or live differs from catalog identity — can restore original. */
  const canRestoreOriginal = draftKitId !== ownKitId || savedKitId !== ownKitId;

  const save = async (kitId: AdminTabKitId = draftKitId) => {
    setRowMessage(null);
    const ok = await onSave(kitId);
    if (ok) {
      setDraftKitId(kitId);
      setRowMessage(
        kitId === ownKitId
          ? "Restored original style"
          : `Saved — live pages use ${kitId}`,
      );
    } else {
      setRowMessage("Save failed");
    }
  };

  const restoreOriginal = async () => {
    setDraftKitId(ownKitId);
    if (savedKitId === ownKitId) {
      setRowMessage("Already on original style");
      return;
    }
    await save(ownKitId);
  };

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
          <div className="flex flex-wrap items-center gap-2">
            {liveRemapped ? (
              <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-coral">
                Live → {savedKitId}
              </span>
            ) : null}
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
              {viewportLabel(entry)}
            </p>
          </div>
        </div>
        <p className="mt-1 text-sm font-medium text-navy">{entry.title}</p>
        <p className="mt-1 text-xs text-slate">{entry.where}</p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <p className="mb-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
            Surface (role) · source labels
          </p>
          <Surface surface={entry.surface}>
            <PreviewForStyle styleId={entry.id} sample={sourceSample} />
          </Surface>
          <p className="mt-2 font-mono text-[10px] text-charcoal/45">
            Labels: {sourceSample.labels.join(" · ")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-charcoal/55">
            {entry.note}
          </p>
        </div>

        <div className="border-t border-charcoal/[0.08] pt-4">
          <p className="mb-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
            Use style
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="min-w-0 flex-1 rounded border border-charcoal/15 bg-white px-2 py-1.5 font-mono text-[11px] text-navy disabled:opacity-40 sm:max-w-[18rem]"
              value={draftKitId}
              disabled={saving}
              aria-label={`Draft style for ${entry.id}`}
              onChange={(e) => {
                setDraftKitId(e.target.value as AdminTabKitId);
                setRowMessage(null);
              }}
            >
              {ADMIN_TAB_KIT.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.id}
                  {opt.id === entry.id ? " (own)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-gold/40 text-navy bg-gold/15 hover:bg-gold/25 disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
            <button
              type="button"
              onClick={() => void restoreOriginal()}
              disabled={saving || !canRestoreOriginal}
              title="Restore this surface to its catalog identity style and save"
              className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-charcoal/20 text-navy hover:bg-cream/60 disabled:opacity-40 disabled:pointer-events-none"
            >
              Original style
            </button>
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setDraftKitId(savedKitId);
                  setRowMessage(null);
                }}
                disabled={saving}
                title="Discard unsaved Use style change"
                className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-charcoal/15 text-charcoal/70 hover:bg-cream/60 disabled:opacity-40"
              >
                Undo draft
              </button>
            ) : null}
          </div>
          {draftRemapped ? (
            <p className="mt-1.5 font-mono text-[10px] text-charcoal/45">
              After save, chrome becomes{" "}
              <span className="text-navy">{draftKitId}</span>
              {draftEntry.title !== entry.title
                ? ` · ${draftEntry.title}`
                : ""}
              — labels stay {sourceSample.labels.join(" / ")}
            </p>
          ) : (
            <p className="mt-1.5 font-mono text-[10px] text-charcoal/45">
              After save, this surface keeps its own style and labels
            </p>
          )}
          <p className="mt-3 mb-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
            After (preview) · same source labels
          </p>
          <Surface surface={draftEntry.surface}>
            <PreviewForStyle styleId={draftKitId} sample={sourceSample} />
          </Surface>
          {rowMessage ? (
            <p
              className={`mt-2 font-mono text-[10px] ${
                rowMessage.includes("fail") ? "text-coral" : "text-sage"
              }`}
            >
              {rowMessage}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Live catalog + per-surface Assignments woven into each style group.
 * Deep link: /admin?tab=server&panel=ui-kit
 */
export default function AdminUiKitPanel() {
  const groups = adminTabKitGroups();
  const [assignments, setAssignments] = useState<TabKitAssignments>(
    defaultTabKitAssignments,
  );
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tab-kit-assignments", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { assignments?: TabKitAssignments };
      if (body.assignments) setAssignments(body.assignments);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRole = async (
    roleId: AdminTabKitId,
    kitId: AdminTabKitId,
  ): Promise<boolean> => {
    setSavingRole(roleId);
    setBannerMessage(null);
    try {
      const res = await fetch("/api/admin/tab-kit-assignments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleId, kitId }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        assignments?: TabKitAssignments;
      };
      if (!res.ok || !body.assignments) {
        setBannerMessage(body.error ?? "Save failed");
        return false;
      }
      setAssignments(body.assignments);
      dispatchTabKitAssignmentsChanged();
      return true;
    } catch (err) {
      setBannerMessage(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSavingRole(null);
    }
  };

  const resetAll = async () => {
    setSavingRole("reset");
    setBannerMessage(null);
    try {
      const res = await fetch("/api/admin/tab-kit-assignments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const body = (await res.json()) as {
        assignments?: TabKitAssignments;
        error?: string;
      };
      if (!res.ok || !body.assignments) {
        setBannerMessage(body.error ?? "Reset failed");
        return;
      }
      setAssignments(body.assignments);
      dispatchTabKitAssignmentsChanged();
      setBannerMessage("All assignments restored to defaults");
    } catch (err) {
      setBannerMessage(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSavingRole(null);
    }
  };

  const remapped = ADMIN_TAB_KIT.filter(
    (row) => assignments[row.id] && assignments[row.id] !== row.id,
  ).length;

  return (
    <div id="admin-ui-kit" className="scroll-mt-24 space-y-8">
      <div
        id="admin-ui-kit-assignments"
        className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              UI kit — tab styles
            </p>
            <p className="mt-2 max-w-3xl text-sm text-slate">
              Each card is a surface (role) with its real source labels. Pick a{" "}
              <span className="font-medium text-navy">Use style</span> to preview
              those same labels in the new chrome — Save changes style only,
              labels stay. Persisted in Postgres{" "}
              <span className="font-mono text-[11px]">tab_kit_assignments</span>
              . Segmented / independent remaps paint Market Pulse, Stats,
              Intelligence filters, Deal of the Week, and Fixer Uppers.
            </p>
            <p className="mt-2 font-mono text-[10px] text-charcoal/45">
              {remapped} remapped · {ADMIN_TAB_KIT.length} surfaces ·{" "}
              {groups.length} groups
            </p>
          </div>
          <button
            type="button"
            onClick={() => void resetAll()}
            disabled={savingRole != null}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-charcoal/20 text-navy hover:bg-cream/60 disabled:opacity-40"
          >
            Reset all
          </button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {groups.map((group) => (
            <li key={group}>
              <a
                href={`#tab-kit-group-${group.replace(/\s+/g, "-").toLowerCase()}`}
                className="font-mono text-[10px] tracking-[0.08em] text-navy underline decoration-navy/20 underline-offset-2 hover:decoration-navy"
              >
                {group}
              </a>
            </li>
          ))}
        </ul>
        {bannerMessage ? (
          <p
            className={`mt-3 font-mono text-[10px] ${
              bannerMessage.toLowerCase().includes("fail")
                ? "text-coral"
                : "text-sage"
            }`}
          >
            {bannerMessage}
          </p>
        ) : null}
      </div>

      {groups.map((group) => {
        const groupId = `tab-kit-group-${group.replace(/\s+/g, "-").toLowerCase()}`;
        const rows = ADMIN_TAB_KIT.filter((row) => row.group === group);
        return (
          <section key={group} id={groupId} className="scroll-mt-24 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal/45">
                {group}
              </h2>
              <p className="font-mono text-[10px] text-charcoal/35">
                {rows.length} surface{rows.length === 1 ? "" : "s"} · assign
                below each preview
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {rows.map((row) => {
                const roleId = row.id as AdminTabKitId;
                return (
                  <KitCard
                    key={row.id}
                    entry={row}
                    savedKitId={assignments[roleId] ?? roleId}
                    saving={savingRole === roleId || savingRole === "reset"}
                    onSave={(kitId) => saveRole(roleId, kitId)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
