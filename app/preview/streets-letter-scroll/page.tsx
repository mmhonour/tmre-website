import HeaderScrollOffset from "@/components/HeaderScrollOffset";
import { HEADER_SCROLL_MT } from "@/lib/header-scroll-offset";

export const metadata = {
  title: "Preview — Streets letter jump — TMRE",
  robots: { index: false, follow: false },
};

const GROUPS: { letter: string; streets: string[] }[] = [
  {
    letter: "A",
    streets: [
      "Acorn Ln",
      "Adams Rd",
      "Apple Tree Ln",
      "Aspetuck Ave",
      "Avery Pl",
    ],
  },
  {
    letter: "B",
    streets: [
      "Bayberry Ln",
      "Beachside Ave",
      "Belden Hill Rd",
      "Bridge St",
      "Bulkley Ave N",
      "Bulkley Ave S",
    ],
  },
  {
    letter: "C",
    streets: [
      "Canal St",
      "Center St",
      "Clinton Ave",
      "Compo Rd N",
      "Compo Rd S",
      "Crescent Rd",
    ],
  },
  {
    letter: "L",
    streets: [
      "Lafayette Pl",
      "Lake Ave",
      "Long Lots Rd",
      "Ludlow Rd",
      "Lyons Plains Rd",
    ],
  },
  {
    letter: "M",
    streets: [
      "Main St",
      "Maple Ave",
      "Meadowbrook Rd",
      "Mill Hill Rd",
      "Myrtle Ave",
    ],
  },
  {
    letter: "P",
    streets: [
      "Park Ave",
      "Post Rd E",
      "Post Rd W",
      "Princes Pine Rd",
      "Putnam Ave",
    ],
  },
  {
    letter: "S",
    streets: [
      "Saugatuck Ave",
      "Sherwood Dr",
      "South Compo Rd",
      "Stony Brook Rd",
      "Sunny Ridge Rd",
    ],
  },
];

export default function StreetsLetterScrollPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <HeaderScrollOffset />
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Streets letter jump
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Click a letter. The heading should sit just under the fixed header —
          not one or two streets further down, with the letter hidden.
        </p>
        <nav
          className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[13px]"
          aria-label="Letters"
        >
          {GROUPS.map((group) => (
            <a
              key={group.letter}
              href={`#letter-${group.letter}`}
              className="text-navy/70 hover:text-navy"
            >
              {group.letter}
            </a>
          ))}
        </nav>
        <div className="mt-8 space-y-24">
          {GROUPS.map((group) => (
            <div
              key={group.letter}
              id={`letter-${group.letter}`}
              className={HEADER_SCROLL_MT}
            >
              <h2 className="mb-3 font-serif text-2xl italic text-navy">
                {group.letter}
              </h2>
              <ul className="space-y-1">
                {group.streets.map((name) => (
                  <li key={name} className="py-0.5 text-sm text-charcoal/85">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
