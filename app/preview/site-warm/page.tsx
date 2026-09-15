import AdminIncrementalArchitectureDiagram from "@/components/admin/AdminIncrementalArchitectureDiagram";
import { describeIncrementalSyncArchitecture } from "@/lib/incremental-sync-architecture";

export const metadata = {
  title: "Preview — Site warm — TMRE",
  robots: { index: false, follow: false },
};

export default function SiteWarmPreviewPage() {
  const arch = describeIncrementalSyncArchitecture();
  const siteWarm = arch.ownership.find((lane) => lane.id === "lane-3");

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">Site warm</h1>
        <p className="mb-8 max-w-3xl text-sm leading-relaxed text-slate">
          Lane 3 is now <span className="font-medium text-navy">Site warm</span>{" "}
          — Netlify filling boards, feeds, stats, and the showcase six after
          Railway has written Neon. Incremental RETS stays ids-only. Photo 0
          for listing-alert mail is prompted before alerts go dirty. Mail is the
          Railway alerts job. Production: Admin → Syncs → Dashboard.
        </p>

        {siteWarm ? (
          <div className="mb-8 rounded-2xl border border-sage/40 bg-sage/[0.08] px-5 py-4">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
              {siteWarm.title}
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.08em] uppercase text-gold">
              {siteWarm.host}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              <span className="font-medium text-navy/80">Owns: </span>
              {siteWarm.owns}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate/80">
              <span className="font-medium text-coral/90">Does not: </span>
              {siteWarm.doesNot}
            </p>
          </div>
        ) : null}

        <pre className="mb-8 overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4 font-mono text-[11px] leading-relaxed text-navy">
          {`Lane 1  Railway  RETS → Neon (ids only in the photo queue)
Lane 2  Neon     End / heartbeat = inventory truth
Site warm  Netlify  feeds · board · stats · showcase six
                    not mail · not RETS

photo 0  Incremental / OH prompt R2  →  then mark alerts dirty
mail     Railway alerts job
fallback  ?size=full&fetch=1 in Gmail`}
        </pre>

        <AdminIncrementalArchitectureDiagram />
      </div>
    </div>
  );
}
