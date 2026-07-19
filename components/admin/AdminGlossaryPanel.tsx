"use client";

import { useMemo, useState } from "react";
import {
  ADMIN_GLOSSARY,
  GLOSSARY_CATEGORIES,
  glossaryGrouped,
  type GlossaryCategoryId,
} from "@/lib/admin-glossary";

/**
 * Admin Glossary — acronyms & concepts from product chats since this PC setup.
 * Category groups start collapsed; click the heading to expand.
 */
export default function AdminGlossaryPanel() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<GlossaryCategoryId | "all">(
    "all",
  );
  /** Expanded category ids — default empty so every group starts minimized. */
  const [expanded, setExpanded] = useState<Set<GlossaryCategoryId>>(
    () => new Set(),
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return glossaryGrouped()
      .filter(
        (g) => categoryFilter === "all" || g.category.id === categoryFilter,
      )
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => {
          if (!q) return true;
          return (
            e.term.toLowerCase().includes(q) ||
            e.definition.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.entries.length > 0);
  }, [query, categoryFilter]);

  const totalVisible = groups.reduce((n, g) => n + g.entries.length, 0);

  const toggleGroup = (id: GlossaryCategoryId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div id="admin-glossary" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm">
        <div className="border-b border-charcoal/[0.08] bg-cream/30 px-5 sm:px-6 py-4 space-y-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              Glossary
            </p>
            <p className="mt-1 text-sm text-slate max-w-2xl">
              Acronyms and concepts explained since work started on this PC —
              MLS/RETS, sync, Goldilocks, photos, tabs, and tooling.{" "}
              {totalVisible.toLocaleString()} of {ADMIN_GLOSSARY.length} terms
              shown. Groups start collapsed — open a heading to read terms.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms…"
              className="w-full sm:max-w-xs rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-charcoal/35 focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                  categoryFilter === "all"
                    ? "border-navy/30 bg-navy/10 text-navy"
                    : "border-charcoal/15 text-charcoal/50 hover:text-navy"
                }`}
              >
                All
              </button>
              {GLOSSARY_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setCategoryFilter((prev) =>
                      prev === cat.id ? "all" : cat.id,
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                    categoryFilter === cat.id
                      ? "border-navy/30 bg-navy/10 text-navy"
                      : "border-charcoal/15 text-charcoal/50 hover:text-navy"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="font-mono text-[11px] text-charcoal/45 px-1">
          No terms match that search.
        </p>
      ) : null}

      {groups.map(({ category, entries }) => {
        const isOpen = expanded.has(category.id);
        return (
          <section
            key={category.id}
            id={`admin-glossary-${category.id}`}
            className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggleGroup(category.id)}
              aria-expanded={isOpen}
              className={`flex w-full items-center justify-between gap-3 bg-cream/30 px-5 sm:px-6 py-3 text-left transition-colors hover:bg-cream/50 ${
                isOpen ? "border-b border-charcoal/[0.08]" : ""
              }`}
            >
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                {category.label}
                <span className="ml-2 text-charcoal/35 normal-case tracking-normal">
                  ({entries.length})
                </span>
              </span>
              <span
                className={`inline-block shrink-0 text-charcoal/45 transition-transform duration-150 ${
                  isOpen ? "rotate-0" : "-rotate-90"
                }`}
                aria-hidden
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  className="block"
                >
                  <path d="M2.2 4.1a.75.75 0 0 1 1.06-.05L6 6.6l2.74-2.55a.75.75 0 0 1 1.02 1.1L6.5 8.15a.75.75 0 0 1-1.02 0L2.25 5.15a.75.75 0 0 1-.05-1.05z" />
                </svg>
              </span>
            </button>
            {isOpen ? (
              <dl className="divide-y divide-charcoal/[0.06]">
                {entries.map((entry) => (
                  <div
                    key={`${category.id}-${entry.term}`}
                    className="px-5 sm:px-6 py-4 grid gap-1 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-6"
                  >
                    <dt className="font-mono text-[12px] tracking-[0.06em] text-navy font-semibold leading-snug">
                      {entry.term}
                    </dt>
                    <dd className="text-sm text-slate leading-relaxed">
                      {entry.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
