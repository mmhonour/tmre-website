import Link from "next/link";

const columns = [
  {
    title: "Markets",
    links: [
      { href: "/intelligence?city=norwalk", label: "Norwalk" },
      { href: "/intelligence?city=westport", label: "Westport" },
      { href: "/intelligence", label: "Live Deal Board" },
      { href: "/intelligence", label: "Market Pulse" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/intelligence", label: "Market Intelligence" },
      { href: "/properties", label: "Active Projects" },
      { href: "/investors", label: "For Investors" },
      { href: "#", label: "Weekly Brief" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About TMRE" },
      { href: "/about", label: "Methodology" },
      { href: "#", label: "Press" },
      { href: "#", label: "Contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="navy-gradient text-white mt-auto">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-11 h-11 rounded-lg bg-gradient-to-br from-gold to-gold/70 flex items-center justify-center">
                <span className="font-serif italic text-navy text-xl font-bold leading-none">
                  T
                </span>
              </span>
              <span className="font-serif text-2xl tracking-[0.15em]">TMRE</span>
            </div>
            <p className="text-white/70 text-sm leading-relaxed max-w-sm">
              AI-native market intelligence for Norwalk, Westport, Wilton, and Fairfield, CT.
              Confidence through clarity — where smart real estate decisions
              begin.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-mono text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse-dot" />
              <span>Markets live · Updated daily</span>
            </div>
          </div>

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
            © {new Date().getFullYear()} TMRE · Norwalk · Westport · Wilton · Fairfield, CT
          </p>
          <p className="text-xs text-white/40 italic font-serif">
            Confidence through clarity.
          </p>
        </div>
      </div>
    </footer>
  );
}
