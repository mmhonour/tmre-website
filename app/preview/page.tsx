import Link from "next/link";
import { UI_PREVIEWS, uiPreviewHref } from "@/lib/ui-previews";

export const metadata = {
  title: "UI previews — TMRE",
  robots: { index: false, follow: false },
};

export default function UiPreviewIndexPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">Preview pages</h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Isolated screens for UI work. Fixture data — not production nav, not
          indexed.
        </p>
        <ul className="space-y-3">
          {UI_PREVIEWS.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={uiPreviewHref(entry.slug)}
                className="block rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4 transition-all hover:border-gold/40 hover:shadow-sm"
              >
                <p className="font-medium text-navy">{entry.title}</p>
                <p className="mt-1 text-sm text-slate">{entry.summary}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate/70">
                  {uiPreviewHref(entry.slug)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
