import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import LeadForm from "@/components/LeadForm";
import MarketPulseContent from "@/components/MarketPulseContent";
import MarketPulseHero from "@/components/MarketPulseHero";
import {
  formatMarketDigestNextEmailDate,
  getMarketDigestConfigFresh,
  nextMarketDigestSendAt,
} from "@/lib/market-digest-config";
import { buildMarketDigestSnapshot } from "@/lib/market-digest";
import {
  getMarketPulseThemeFresh,
  marketPulseThemeCssVars,
} from "@/lib/page-theme-config";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const dynamic = "force-dynamic";
/** Commercial tab hits Neon for Active + recent Closed; keep under Netlify's SSR budget. */
export const maxDuration = 26;

export const metadata: Metadata = {
  title: "Market Pulse",
  description: `TMRE Market Pulse — live web preview of the Monday market brief for ${TMRE_CORE_TOWNS_LABEL}, CT: months supply, inventory, and Deal of the Week.`,
  alternates: { canonical: "/market-pulse" },
};

export default async function MarketPulsePage() {
  const [snapshot, theme, digest] = await Promise.all([
    buildMarketDigestSnapshot(),
    getMarketPulseThemeFresh(),
    getMarketDigestConfigFresh(),
  ]);
  const etDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(snapshot.generatedAt));
  const lastSentMs = digest.lastSentAt ? Date.parse(digest.lastSentAt) : NaN;
  const lastEmailDate = Number.isFinite(lastSentMs)
    ? formatMarketDigestNextEmailDate(new Date(lastSentMs))
    : null;
  const nextEmailDate = formatMarketDigestNextEmailDate(
    nextMarketDigestSendAt(digest),
  );

  return (
    <>
      <MarketPulseHero
        etDate={etDate}
        townsLabel={TMRE_CORE_TOWNS_LABEL}
        lastEmailDate={lastEmailDate}
        nextEmailDate={nextEmailDate}
      />

      <main
        style={marketPulseThemeCssVars(theme) as CSSProperties}
        className="market-pulse-theme min-h-[50vh] bg-[var(--mp-page-bg)] [font-family:var(--mp-body-font)]"
      >
        <section className="pt-8 pb-6 lg:pt-10 lg:pb-8">
          <div className="px-2 sm:px-6 lg:px-10 pb-12">
            <MarketPulseContent snapshot={snapshot} etDate={etDate} />
          </div>
        </section>

        <section className="relative py-14 lg:py-20 overflow-hidden navy-gradient">
          <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-6 lg:px-10 text-center">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4">
              Get it Mondays
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl text-white leading-[1.1]">
              Prefer inbox?{" "}
              <span className="italic text-gold">Join the brief.</span>
            </h2>
            <p className="mt-4 text-white/70 leading-relaxed">
              Same Market Pulse content, Monday morning. Or stay on the{" "}
              <Link
                href="/stats"
                className="text-gold underline underline-offset-2"
              >
                live stats
              </Link>{" "}
              board anytime.
            </p>
            <div className="mt-8">
              <LeadForm source="market-pulse" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
