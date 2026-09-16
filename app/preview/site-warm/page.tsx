import AdminIncrementalArchitectureDiagram from "@/components/admin/AdminIncrementalArchitectureDiagram";
import { describeIncrementalSyncArchitecture } from "@/lib/incremental-sync-architecture";

export const metadata = {
  title: "Preview — Lane 3 Site warm — TMRE",
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
        <h1 className="mb-2 font-serif text-3xl text-navy">Lane 3 — Site warm</h1>
        <p className="mb-8 max-w-3xl text-sm leading-relaxed text-slate">
          Lane 3 is the slot. The parlance is{" "}
          <span className="font-medium text-navy">Site warm</span>: Netlify
          filling boards, feeds, and the showcase six after Railway has written
          Neon. It is not a Railway job. Incremental RETS stays ids-only. Photo
          0 for listing-alert mail is prompted before alerts go dirty. Mail is
          the Railway alerts job. Stats-cache and the R2 photo scavenger already have
          their own Railway children. Production: Admin → Syncs → Dashboard.
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
          {`Lane 1  Railway     RETS → Neon (ids only in the photo queue)
Lane 2  Neon        End / heartbeat = inventory truth
Lane 3  Site warm   Netlify  feeds · board · showcase six
                    not mail · not RETS · not a Railway job

photo 0     Incremental / OH prompt R2  →  then mark alerts dirty
mail        Railway alerts job
stats       Railway stats-cache child (already)
r2 photos   Railway hero-photos scavenger (already)
fallback    ?size=full&fetch=1 in Gmail`}
        </pre>

        <AdminIncrementalArchitectureDiagram />
      </div>
    </div>
  );
}
