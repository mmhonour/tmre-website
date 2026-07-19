import Link from "next/link";
import Image from "next/image";
import FooterMarketsColumn from "@/components/FooterMarketsColumn";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { getLastFullSync } from "@/lib/listings-store";
import { AGENT_MLS_ID, AGENT_NAME } from "@/lib/business-info";
import { getBrokerageNameFresh } from "@/lib/brokerage-config";
function formatLastBuilt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

const columns = [
  {
    title: "Resources",    links: [
      { href: "/stats", label: "Market Intelligence" },
      { href: "/new-construction", label: "Active Projects" },
      { href: "/investors", label: "For Investors" },
      { href: "#", label: "Weekly Brief" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About TMRE" },
      { href: "/about", label: "Methodology" },
      { href: "/contact", label: "Contact" },
      { href: "/list-with-me", label: "List with me" },
    ],
  },
];

/** Equal Housing Opportunity mark — a house outline with an equals sign. */
function EqualHousingMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Equal Housing Opportunity"
    >
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 13h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

export default async function Footer({
  brokerageName,
}: {
  brokerageName?: string;
} = {}) {
  const lastBuilt = formatLastBuilt(getLastFullSync());
  const brokerage = brokerageName?.trim() || (await getBrokerageNameFresh());
  return (
    <footer className="navy-gradient text-white mt-auto">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-3 mb-5">
              <Link href="/about" className="group shrink-0" aria-label="About Timothy Marks">
                <span className="relative block w-11 h-11 rounded-lg overflow-hidden shadow-lg shadow-gold/20 ring-1 ring-gold/40 transition-transform group-hover:scale-105">
                  <Image
                    src="/timothy-tmre.png"
                    alt="Timothy Marks"
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </span>
              </Link>
              <Link
                href="/"
                className="font-serif text-2xl tracking-[0.15em] hover:text-gold transition-colors"
                aria-label="TMRE home"
              >
                TMRE
              </Link>
            </div>
            <p className="text-white/70 text-sm leading-relaxed max-w-sm">
              Market intelligence for {TMRE_CORE_TOWNS_LABEL}, CT.
              Confidence through clarity — where smart real estate decisions
              begin.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-mono text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse-dot" />
              <span>Markets live · Updated daily</span>
            </div>
          </div>

          <FooterMarketsColumn />

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-5">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/75 hover:text-gold transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-white/50 font-mono tracking-wide">
            © {new Date().getFullYear()} TMRE · {TMRE_CORE_TOWNS_LABEL}, CT
          </p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Legal">
            {[
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/contact", label: "Contact" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-white/50 hover:text-gold transition-colors font-mono tracking-wide"
              >
                {link.label}
              </Link>
            ))}
            <p className="text-xs text-white/40 italic font-serif">
              Confidence through clarity.
            </p>
          </nav>
        </div>

        {/* Brokerage attribution + fair-housing disclosure (real-estate standard). */}
        <div className="mt-6 flex items-start gap-3">
          <EqualHousingMark className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
          <p className="text-[11px] leading-relaxed text-white/40 max-w-3xl">
            {AGENT_NAME} (MLS #{AGENT_MLS_ID}) is a licensed real estate agent
            affiliated with {brokerage}. Equal Housing Opportunity. Property and market
            information is sourced from MLS and public records, is deemed
            reliable but not guaranteed, and should be independently verified.
          </p>
        </div>

        <p className="mt-4 text-left text-[11px] text-white/[0.16] font-mono tracking-wide">
          {lastBuilt
            ? `Refreshed: ${lastBuilt} ET`
            : "Refresh pending"}
        </p>
      </div>
    </footer>
  );
}
