import { cookies } from "next/headers";
import SitePasswordGate from "@/components/SitePasswordGate";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import {
  formatVisitorIdentity,
  formatVisitorLocation,
  readVisitorRecords,
  type VisitorRecord,
} from "@/lib/visitors";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Visitors — TMRE",
  description: "Website visitor activity and location log.",
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function recentPaths(visitor: VisitorRecord, limit = 4): string {
  const paths = [...visitor.pages]
    .reverse()
    .map((p) => p.path)
    .filter(Boolean);
  const unique: string[] = [];
  for (const path of paths) {
    if (!unique.includes(path)) unique.push(path);
    if (unique.length >= limit) break;
  }
  return unique.join(" → ") || "—";
}

export default async function VisitorsPage() {
  const jar = await cookies();
  const unlocked = jar.get(SITE_PASSWORD_COOKIE)?.value === "1";

  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Visitors access."
        subtitle="Enter the TMRE password to view website visitor activity."
      />
    );
  }

  const visitors = await readVisitorRecords();
  const identified = visitors.filter((v) => Boolean(v.email)).length;
  const totalPageviews = visitors.reduce((sum, v) => sum + (v.pageviews || 0), 0);

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Explore
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Visitors{" "}
            <span className="italic gold-shimmer">log.</span>
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            Anonymous and identified visits captured by the site beacon — location when
            available, recent pages, and lead details when someone submits a form.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-white/55 animate-fade-up-delay-2">
            <span>{visitors.length.toLocaleString()} visitors</span>
            <span>{identified.toLocaleString()} identified</span>
            <span>{totalPageviews.toLocaleString()} pageviews</span>
          </div>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
            <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                All visitors
              </p>
              <p className="text-sm text-slate">Sorted by most recently seen</p>
            </div>

            {visitors.length === 0 ? (
              <div className="px-5 sm:px-6 py-10">
                <p className="text-sm text-slate">No visitors logged yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-charcoal/[0.08]">
                {visitors.map((visitor) => (
                  <li key={visitor.vid} className="px-5 sm:px-6 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,1.4fr)_auto] gap-2 lg:gap-6 lg:items-start">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                          {formatVisitorIdentity(visitor)}
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          {formatVisitorLocation(visitor)}
                          {visitor.geo.org ? (
                            <span className="text-charcoal/40"> · {visitor.geo.org}</span>
                          ) : null}
                        </p>
                        {visitor.audienceType ? (
                          <p className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-gold">
                            {visitor.audienceType}
                          </p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 mb-1">
                          Recent pages
                        </p>
                        <p className="text-sm text-slate break-words">
                          {recentPaths(visitor)}
                        </p>
                        <p className="mt-2 font-mono text-[10px] text-charcoal/35 truncate">
                          {visitor.vid}
                          {visitor.ip ? ` · ${visitor.ip}` : ""}
                        </p>
                      </div>

                      <div className="lg:text-right font-mono text-[11px] tabular-nums text-charcoal/55 space-y-1 shrink-0">
                        <p>
                          <span className="text-navy font-semibold">
                            {visitor.pageviews.toLocaleString()}
                          </span>{" "}
                          views
                        </p>
                        <p>Last {formatTimestamp(visitor.lastSeen)}</p>
                        <p className="text-charcoal/35">
                          First {formatTimestamp(visitor.firstSeen)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
