import ProfileContactTrigger from "@/components/ProfileContactTrigger";

export const metadata = {
  title: "About — TMRE",
  description:
    "TMRE makes data-driven real estate decisions simple — combining AI-powered market intelligence with local expertise in Fairfield County, Massachusetts, and South Florida.",
};

const values = [
  {
    icon: "◐",
    title: "AI-native",
    body: "Market intelligence, property scoring, content generation, and deal analysis powered by AI. Not as a feature — as the foundation of how we operate.",
  },
  {
    icon: "◇",
    title: "Human touch",
    body: "Every client conversation, every negotiation, every moment that matters is led by a real person. Timothy and the TMRE team bring 20+ years of hands-on real estate experience to every interaction.",
  },
  {
    icon: "△",
    title: "Radical transparency",
    body: "We show you the actual math. Our investment case studies include the buy price, renovation cost, and outcome — even when the numbers don't work out. Trust is built on honesty, not cherry-picked wins.",
  },
  {
    icon: "◈",
    title: "Three markets",
    body: "Fairfield County, Massachusetts, and South Florida. Each market has different dynamics, different opportunities, and different risks. TMRE gives you the local intelligence to navigate all three.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* HERO — matches site-wide nav banner style */}
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            About TMRE
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Making Real Estate Simple.
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            TMRE answers the questions that matter most — with data, not guesswork.
          </p>
        </div>
      </section>

      {/* SECTION 1+2 — About frame (left) + Meet the Founder (right) */}
      <section className="bg-white border-b border-charcoal/[0.06] py-12 lg:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-stretch">

            {/* LEFT — About TMRE frame */}
            <div className="lg:col-span-4 flex">
              <div className="navy-gradient relative overflow-hidden rounded-3xl p-8 lg:p-10 text-white w-full flex flex-col justify-between">
                <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
                <div className="relative">
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4">
                    About TMRE
                  </p>
                  <h1 className="font-serif italic text-3xl lg:text-5xl text-white leading-[1.08]">
                    Making Real Estate Simple.
                  </h1>
                  <p className="mt-5 text-sm lg:text-base text-white/70 leading-relaxed">
                    TMRE answers the questions that matter most — with data,
                    not guesswork.
                  </p>
                </div>
                <p className="relative mt-10 font-mono text-[10px] tracking-[0.2em] uppercase text-white/35">
                  Fairfield County · Greater Boston · South Florida
                </p>
              </div>
            </div>

            {/* RIGHT — Meet the Founder */}
            <div className="lg:col-span-8">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-6">
                Meet the founder
              </p>
              <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-start">
                {/* Photo */}
                <div className="sm:w-52 lg:w-64 shrink-0 sm:order-2">
                  <ProfileContactTrigger
                    src="/timothy-tmre.png"
                    alt="Timothy Marks, Agent and Insight Provacateur at TMRE"
                    sizes="(min-width: 1024px) 256px, (min-width: 640px) 208px, 100vw"
                    priority
                  />
                  <div className="mt-4">
                    <h2 className="font-serif text-2xl lg:text-3xl text-navy leading-tight">
                      Timothy Marks
                    </h2>
                    <p className="mt-1 font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                      Agent and Insight Provacateur
                    </p>
                  </div>
                </div>

                {/* Bio */}
                <div className="sm:order-1">
                  <blockquote className="border-l-4 border-gold pl-5 mb-7">
                    <p className="font-serif italic text-lg lg:text-2xl text-navy leading-snug">
                      &ldquo;Distilling markets and making it easier for you to
                      navigate — whether it&rsquo;s listing your home or buying
                      a new one, I&rsquo;m going to put it all together for
                      you.&rdquo;
                    </p>
                  </blockquote>
                  <div className="space-y-4 text-sm lg:text-base text-charcoal leading-relaxed">
                    <p>
                      Timothy is here to work for you. With the pulse of the East
                      Coast he has successfully managed real estate in 3 of the
                      hottest markets — South Florida, Fairfield County, and Boston
                      (Suffolk County) — in addition to having a foothold in NYC.
                      That&rsquo;s not a marketing footprint — it&rsquo;s a data
                      lens. Cycles, rate sensitivity, buyer migration, renovation
                      costs, and inventory shocks rarely hit all three at once, and
                      seeing them in parallel changes what you can tell a Fairfield
                      County client.
                    </p>
                    <p>
                      The discipline behind that lens came from nearly two
                      decades on Wall Street — Rates, Equities, Commodities, and
                      Mortgage Desks at various investment banks. Pricing models,
                      risk frameworks, market-cycle analysis — the tools of a global
                      bank applied to real estate. The pricing recommendation
                      you&rsquo;ll get from Timothy is grounded in data, common
                      sense, and <em>not</em> just another CMA (generic Real Estate comparative
                      market analysis) / opinion.
                    </p>
                    <p>
                      Alongside that career, Timothy spent 20+ years investing as
                      a principal — buying, renovating, holding, and selling
                      across all three markets with his own capital and his own
                      contractor list. When he tells a seller what to skip and
                      where to invest before listing, it&rsquo;s because
                      he&rsquo;s done both versions on his own homes.
                    </p>
                    <p>
                      He&rsquo;s a licensed agent for Berkshire Hathaway Home
                      Services NE, and he and his family live in
                      Westport, his kids attend Westport schools, and the homes
                      he underwrites for clients are the same kind he underwrites
                      for himself.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 3 — Approach */}
      <section className="bg-cream py-12 lg:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-10">
          <div className="space-y-7 text-lg text-charcoal leading-relaxed">
            <p>
              Whether you're a homeowner wondering what your property is
              actually worth today, a seller trying to figure out if that $40K
              kitchen renovation will return $80K or $15K at closing, or an
              investor evaluating whether a teardown-and-rebuild pencils out —
              TMRE gives you the numbers, the context, and the clarity to
              decide with confidence.
            </p>
            <p>
              The real estate industry has made these decisions harder than
              they need to be. Market data is scattered across dozens of
              sources. National headlines contradict local reality. Agents give
              you opinions when you need data. TMRE was built to fix that. We
              combine AI-powered market intelligence with deep local expertise
              in Fairfield County, Massachusetts, and South Florida to turn
              complexity into clarity.
            </p>
            <p>
              We serve every perspective in the transaction. Sellers see what
              their home is worth and which improvements actually move the
              needle. Buyers see what homes really sell for, not what they list
              for. Investors see deal-level economics — entry cost, renovation
              ROI, rental yield, equity creation — scored and ranked in
              real-time. Contractors see where the work is going. Everyone gets
              the same thing: the truth, backed by data, delivered simply.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Values */}
      <section className="bg-white border-t border-charcoal/[0.06] py-12 lg:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-2xl mb-10 lg:mb-14">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
              What we believe
            </p>
            <h2 className="font-serif text-3xl lg:text-5xl text-navy leading-[1.1]">
              Four values, <span className="italic">non-negotiable.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {values.map((v) => (
              <article
                key={v.title}
                className="rounded-2xl bg-cream border border-charcoal/[0.06] p-7 lg:p-8 transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1"
              >
                <div className="text-3xl text-gold mb-5 font-serif">
                  {v.icon}
                </div>
                <h3 className="font-serif text-2xl text-navy mb-3 leading-tight">
                  {v.title}
                </h3>
                <p className="text-slate leading-relaxed">{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
