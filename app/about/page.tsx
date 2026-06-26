import Image from "next/image";

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
      {/* SECTION 1 — Mission */}
      <section className="navy-gradient text-white pt-24 pb-12 lg:pt-40 lg:pb-28 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            About TMRE
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl lg:text-7xl text-white leading-[1.05] max-w-4xl animate-fade-up">
            Making data-driven real estate decisions simple.
          </h1>
          <p className="mt-4 text-base lg:text-xl text-slate-200/80 max-w-2xl animate-fade-up-delay-1">
            TMRE answers the questions that matter most — with data, not
            guesswork.
          </p>
        </div>
      </section>

      {/* SECTION 2 — Meet the Founder */}
      <section className="bg-white border-b border-charcoal/[0.06] py-12 lg:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-2xl mb-10 lg:mb-14">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
              Meet the founder
            </p>
            <h2 className="font-serif text-3xl lg:text-5xl text-navy leading-[1.1]">
              Three markets, one lens.{" "}
              <span className="italic">Built for Fairfield County.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            {/* Photo column */}
            <div className="lg:col-span-5">
              <div className="group relative aspect-square overflow-hidden rounded-3xl shadow-2xl shadow-navy/10 ring-1 ring-charcoal/[0.06]">
                <Image
                  src="/timothy-tmre.png"
                  alt="Timothy Marks, Founder and CEO of TMRE"
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0"
                  priority
                />
              </div>
              <div className="mt-6">
                <h3 className="font-serif text-3xl lg:text-4xl text-navy leading-tight">
                  Timothy Marks
                </h3>
                <p className="mt-1 font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                  Founder &amp; CEO
                </p>
              </div>
            </div>

            {/* Bio column */}
            <div className="lg:col-span-7">
              <blockquote className="border-l-4 border-gold pl-5 mb-8 lg:mb-10">
                <p className="font-serif italic text-xl lg:text-3xl text-navy leading-snug">
                  &ldquo;Most agents see one market. I read three at once.
                  When the cycle is turning in Westport, I&rsquo;ve usually
                  already watched it move in Boston or Palm Beach
                  first.&rdquo;
                </p>
              </blockquote>

              <div className="space-y-5 text-base lg:text-lg text-charcoal leading-relaxed">
                <p>
                  Timothy operates three markets at the same time: Fairfield
                  County, Greater Boston, and South Florida. That&rsquo;s not
                  a marketing footprint — it&rsquo;s a data lens. Cycles,
                  rate sensitivity, buyer migration, renovation costs, and
                  inventory shocks rarely hit all three at once, and seeing
                  them in parallel changes what you can tell a Fairfield
                  County client. When inventory tightens in Wellesley before
                  it tightens in Norwalk, that&rsquo;s a signal. When Palm
                  Beach price-per-sqft starts compressing, that&rsquo;s
                  another. Most Fairfield County agents have never worked
                  outside the county. Timothy reads three feeds every
                  morning.
                </p>
                <p>
                  The discipline behind that lens came from nearly two
                  decades at JP Morgan. Pricing models, risk frameworks,
                  market-cycle analysis — the tools of a global bank are
                  the tools real estate has been waiting for. Most homeowners
                  on Compo Beach Road have never had an advisor who actually
                  built one. The pricing recommendation you&rsquo;ll get from
                  Timothy is a model, not an opinion. The comps are
                  weighted, not eyeballed.
                </p>
                <p>
                  Alongside that career, Timothy spent 20+ years investing as
                  a principal — buying, renovating, holding, and selling
                  across all three markets with his own capital, his own
                  permits, and his own contractor list. The active projects
                  on this site are his. When he tells a Fairfield County
                  seller what to skip and where to invest before listing,
                  it&rsquo;s because he&rsquo;s done both versions on his
                  own homes and watched what the comps actually did.
                </p>
                <p>
                  That experience runs deeper than transactions. Sellers
                  across Fairfield County — Westport, Darien, New Canaan,
                  Norwalk — are often sitting on enormous unrealized gains
                  and rarely have an advisor who can model the cap-gains
                  exposure, structure a 1031 exchange, or quantify what a
                  $40K kitchen actually returns at closing in their
                  micro-market. Timothy can. He&rsquo;s a licensed broker,
                  he and his family live in Westport, his kids attend
                  Westport schools, and the homes he underwrites for clients
                  are the same kind he underwrites for himself.
                </p>
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
