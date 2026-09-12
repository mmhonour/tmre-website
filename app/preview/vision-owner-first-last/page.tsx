import { formatVisionOwnerDisplay } from "@/lib/vision-owner-display";

export const metadata = {
  title: "Preview — Owner First Last — TMRE",
  robots: { index: false, follow: false },
};

const CASES = [
  {
    label: "Two people (5384)",
    raw: "CASTILLO EDWARD AND SNYDER CAMERON",
  },
  {
    label: "Middle initials",
    raw: "MALTER VALERIE F AND KAYE STUART P",
  },
  {
    label: "Hyphenated last + &",
    raw: "SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE",
  },
  {
    label: "Shared last — 3 Acorn Ln",
    raw: "THARP CHARLES & ADRIANNE",
  },
  {
    label: "Shared last written twice",
    raw: "THARP CHARLES & THARP ADRIANNE",
  },
  {
    label: "Shared last — Irina & Yury",
    raw: "FEYGIN IRINA & YURY",
  },
  {
    label: "Different last names",
    raw: "MARKS TIMOTHY AND HONOUR MELISSA",
  },
  {
    label: "LLC — no flip",
    raw: "ACME HOLDINGS LLC",
  },
  {
    label: "Trust — no flip",
    raw: "SMITH FAMILY TRUST",
  },
] as const;

export default function VisionOwnerFirstLastPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Owner First Last
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          VGSI stores LAST FIRST. Find and Streets show First Last for
          people. A shared last name is First1 & First2 Last — never
          First Last and First. A first name alone is not a landlord.
          LLC / trust lines stay in assessor order.
        </p>
        <ul className="space-y-4">
          {CASES.map((row) => (
            <li
              key={row.raw}
              className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate/55">
                {row.label}
              </p>
              <p className="mt-1 font-mono text-sm text-slate/70">{row.raw}</p>
              <p className="mt-2 font-serif text-2xl text-navy">
                {formatVisionOwnerDisplay(row.raw)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
