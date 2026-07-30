import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import HomeMarketPulse from "@/components/HomeMarketPulse";
import HomeMethodOverview from "@/components/HomeMethodOverview";
import HomeScrollReset from "@/components/HomeScrollReset";
import LeadForm from "@/components/LeadForm";
import { loadHomeMarketPulseTowns } from "@/lib/home-market-pulse";
import { TMRE_PROPERTIES_TOWNS_LABEL, TMRE_TOWNS } from "@/lib/tmre-towns";
import Image from "next/image";
import { Suspense } from "react";

const tools = [
  {
    name: "Market Pulse",
    tagline: "Daily city signal",
    body: `Real-time read on inventory, velocity, and pricing pressure across ${TMRE_TOWNS.join(", ")} — refreshed with the stats cache.`,
    icon: "◐",
  },
  {
    name: "Deal Analyzer",
    tagline: "10-second underwriting",
    body: "Paste any listing URL and get cash flow, yield, ARV, and risk in one screen. Built on the same models we use internally.",
    icon: "◇",
  },
  {
    name: "Home Value Engine",
    tagline: "Beyond Zestimate",
    body: "A range, not a number. Sees micro-blocks, school overlays, and recent sale comps tuned to your home's actual features.",
    icon: "△",
  },
  {
    name: "Smart Alerts",
    tagline: "Movers before they move",
    body: "Tell us your buy box. We watch listings, off-market, and pre-foreclosure feeds and ping you within minutes of a match.",
    icon: "◈",
  },
];

const audiences = [
  {
    label: "Buyers",
    headline: "Buy with the data sellers wish you didn't have.",
    body: "See list-to-sale gaps, days-on-market by block, and value drivers neighbors don't talk about.",
  },
  {
    label: "Sellers",
    headline: "Price like a pro. List like one too.",
    body: "Our home value range plus a strategy brief — when to list, where to invest, what to skip.",
  },
  {
    label: "Investors",
    headline: "See the deal, not just the listing.",
    body: "Live scoring 1-10, flip velocity, rent-grade neighborhoods, and below-replacement-cost alerts.",
  },
  {
    label: "Contractors",
    headline: "Know the project before the call.",
    body: "Permit history, scope hints from listing photos, and homeowner profile by zip — surfaced before you bid.",
  },
];

export default async function Home() {
  const pulseTowns = await loadHomeMarketPulseTowns();

  return (
    <>
      <HomeScrollReset />
      <HomeMethodOverview />
      <Suspense fallback={null}>
        <DealOfTheWeekHero afterOverview />
      </Suspense>
      <HomeMarketPulse towns={pulseTowns} />
      <ToolsSection />
      <AudiencesSection />
      <EmailCtaSection />
    </>
  );
}

function ToolsSection() {
  return (
    <section className="bg-cream py-14 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-10 lg:mb-16 flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
          <div className="max-w-2xl min-w-0 flex-1">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
              Intelligence Tools
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-navy leading-[1.1]">
              Four lenses on the same{" "}
              <span className="italic">
                {TMRE_TOWNS.length} markets.
              </span>
            </h2>
            <p className="mt-4 text-slate text-base lg:text-lg leading-relaxed">
              Every tool runs on the same proprietary deal model. The difference
              is the question you&apos;re asking.
            </p>
          </div>
          <figure className="shrink-0 self-center sm:self-center">
            <div className="relative w-36 sm:w-40 lg:w-44 aspect-[4/3] bg-cream">
              <Image
                src="/images/four-lens-camera.png"
                alt="Vintage four-lens movie camera"
                fill
                className="object-contain object-center grayscale contrast-125 mix-blend-multiply"
                sizes="(max-width: 640px) 144px, 176px"
              />
            </div>
          </figure>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {tools.map((tool) => (
            <article
              key={tool.name}
              className="group relative rounded-2xl bg-white border border-charcoal/[0.06] p-5 lg:p-7 transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1"
            >
              <div className="text-3xl text-gold mb-4 font-serif">
                {tool.icon}
              </div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-2">
                {tool.tagline}
              </p>
              <h3 className="font-serif text-xl lg:text-2xl text-navy mb-2 leading-tight">
                {tool.name}
              </h3>
              <p className="text-sm text-slate leading-relaxed">{tool.body}</p>
              <span className="absolute bottom-5 right-5 lg:bottom-7 lg:right-7 text-gold opacity-0 group-hover:opacity-100 transition-opacity">
                →
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudiencesSection() {
  return (
    <section className="bg-navy text-white py-14 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="max-w-2xl mb-10 lg:mb-16">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Built for everyone in the deal
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-white leading-[1.1]">
            Whatever side you&apos;re{" "}
            <span className="italic gold-shimmer">on.</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {audiences.map((aud, i) => (
            <article
              key={aud.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-7 backdrop-blur-sm transition-all hover:border-gold/40 hover:bg-white/[0.06] hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                  0{i + 1}
                </span>
                <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/50">
                  {aud.label}
                </span>
              </div>
              <h3 className="font-serif text-xl text-white leading-snug mb-4">
                {aud.headline}
              </h3>
              <p className="text-sm text-white/65 leading-relaxed">{aud.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmailCtaSection() {
  return (
    <section className="relative py-14 lg:py-28 overflow-hidden navy-gradient">
      <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-6 lg:px-10 text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4">
          Join the brief
        </p>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-white leading-[1.1]">
          Smart real estate decisions{" "}
          <span className="italic gold-shimmer">begin Monday.</span>
        </h2>
        <p className="mt-6 text-white/70 text-lg leading-relaxed">
          One email a week. {TMRE_PROPERTIES_TOWNS_LABEL} intel, scored deals, and the
          one chart that mattered. Free.
        </p>
        <div className="mt-10">
          <LeadForm source="home-cta" />
        </div>
      </div>
    </section>
  );
}
