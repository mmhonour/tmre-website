import Link from "next/link";
import {
  BOARD_PREVIEW_HREF,
  BOARD_PREVIEW_SUBTITLE,
  BOARD_PREVIEW_TITLE,
} from "@/components/intelligence/board-preview/types";

export const metadata = {
  title: "Deal Board Layout Preview — TMRE",
  robots: { index: false, follow: false },
};

export default function BoardPreviewIndexPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link
          href="/intelligence"
          className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate hover:text-gold transition-colors"
        >
          ← Back to deal board
        </Link>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-6 mb-2">
          Layout preview
        </p>
        <h1 className="font-serif text-3xl text-navy mb-2">Deal board layout</h1>
        <p className="text-slate text-sm leading-relaxed mb-8">
          Photo-led rows are the production deal board layout. This test page uses
          sample listings (live Westport inventory when available).
        </p>
        <Link
          href={BOARD_PREVIEW_HREF}
          className="block rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4 hover:border-gold/40 hover:shadow-sm transition-all group"
        >
          <p className="font-medium text-navy group-hover:text-gold transition-colors">
            {BOARD_PREVIEW_TITLE}
          </p>
          <p className="text-sm text-slate mt-1">{BOARD_PREVIEW_SUBTITLE}</p>
        </Link>
        <p className="mt-8 text-xs text-slate/70 font-mono">
          Test route only — not linked from production nav.
        </p>
      </div>
    </div>
  );
}
