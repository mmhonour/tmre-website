import { cookies } from "next/headers";
import SitePasswordGate from "@/components/SitePasswordGate";
import VisitorsGroupedLog from "@/components/VisitorsGroupedLog";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import {
  groupVisitorsByProviderThenLocation,
  readVisitorRecords,
} from "@/lib/visitors";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Visitors — TMRE",
  description: "Website visitor activity and location log.",
};

export default async function VisitorsPage() {
  const jar = await cookies();
  const unlocked = jar.get(SITE_PASSWORD_COOKIE)?.value === "1";

  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Visitors access."
        subtitle="Use the same Admin password as Log in (header) to view website visitor activity."
      />
    );
  }

  const visitors = await readVisitorRecords();
  const groups = groupVisitorsByProviderThenLocation(visitors);
  const identified = visitors.filter((v) => Boolean(v.email)).length;
  const totalPageviews = visitors.reduce((sum, v) => sum + (v.pageviews || 0), 0);

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Restricted
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Visitors{" "}
            <span className="italic gold-shimmer">log.</span>
          </h1>
          <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            Grouped by network provider, then location. Use + / − to drill into
            locations and individual visitors.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-white/55 animate-fade-up-delay-2">
            <span>{visitors.length.toLocaleString()} visitors</span>
            <span>{groups.length.toLocaleString()} providers</span>
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
                By provider → location
              </p>
              <p className="text-sm text-slate">
                Providers and locations sorted by pageviews (desc)
              </p>
            </div>

            <VisitorsGroupedLog groups={groups} />
          </div>
        </div>
      </section>
    </>
  );
}
