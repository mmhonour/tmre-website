"use client";

import { useEffect, useState } from "react";
import type { OwnerGroup } from "@/app/api/owner-history/route";

type ApiResponse = { owners: OwnerGroup[]; fetchedAt: string; source: string; error?: string };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function OwnerHistoryClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/owner-history", { cache: "no-store" })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = (data?.owners ?? []).filter((o) =>
    o.owner.toLowerCase().includes(search.toLowerCase()) ||
    o.properties.some((p) => p.address.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      {/* Hero */}
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Owner History
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Westport property{" "}
            <span className="italic gold-shimmer">owners.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Recent property owners in Westport, CT — sourced from public tax records via Vision Appraisal.
          </p>
          {data && (
            <p className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/35">
              {data.owners.length} owners · {filtered.length} shown · updated {timeAgo(data.fetchedAt)}
            </p>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {/* Search */}
          <div className="mb-8 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search owner name or address…"
              className="w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-mono text-sm text-navy placeholder-slate/50 focus:border-gold/50 focus:outline-none transition-colors"
            />
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="rounded-2xl bg-white border border-charcoal/[0.06] h-36 animate-pulse" />
              ))}
            </div>
          ) : !data || data.owners.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4">
                No data available
              </p>
              <p className="text-charcoal/60 max-w-sm mx-auto text-sm">
                {data?.error ?? "Could not load owner records from Vision Appraisal. Try again shortly."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-charcoal/60 font-mono text-sm">No results for &ldquo;{search}&rdquo;</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {filtered.map((owner) => (
                <OwnerCard key={owner.owner} group={owner} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function OwnerCard({ group }: { group: OwnerGroup }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.properties : group.properties.slice(0, 2);

  return (
    <article className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-navy/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="font-serif text-lg text-navy leading-tight">{group.owner}</h2>
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase bg-navy/5 text-navy/60 rounded-full px-2.5 py-1 whitespace-nowrap shrink-0">
          {group.properties.length} {group.properties.length === 1 ? "property" : "properties"}
        </span>
      </div>

      <div className="space-y-2.5">
        {shown.map((p, i) => (
          <div key={i} className="border-t border-charcoal/[0.05] pt-2.5 first:border-0 first:pt-0">
            <p className="font-medium text-sm text-navy leading-snug">{p.address}</p>
            <div className="flex items-center gap-3 mt-1">
              {p.saleDate && (
                <span className="font-mono text-[10px] text-slate/60">{p.saleDate}</span>
              )}
              {p.salePrice && p.salePrice !== "—" && (
                <span className="font-mono text-[10px] text-gold">{p.salePrice}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {group.properties.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline transition-colors"
        >
          {expanded ? "Show less ▲" : `+${group.properties.length - 2} more ▼`}
        </button>
      )}
    </article>
  );
}
