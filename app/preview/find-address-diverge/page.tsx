import { FindAddressDivergenceNote } from "@/components/FindAddressDivergenceNote";
import { findAddressDivergence } from "@/lib/find-address-divergence";

export const metadata = {
  title: "Preview — Vision vs MLS address — TMRE",
  robots: { index: false, follow: false },
};

const DIVERGE = findAddressDivergence(
  "2A STONY PT RD",
  "2A-A Stony Point Road",
);
const SAME = findAddressDivergence("16 Sea Spray Rd", "16 Sea Spray Rd");
const LOCUST = findAddressDivergence("5 LOCUST LN", "5 Locust Lane");
const NO_MLS = findAddressDivergence("2A STONY PT RD", null);

export default function FindAddressDivergePreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Vision vs MLS address
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          FYI on the Find parcel page when the assessor line and the MLS
          street are not the same spelling. Fixture only — no listing
          database. Production: /find/westport/5384 after a listing is
          linked.
        </p>

        <section className="mb-8 rounded-2xl bg-[#131F38] px-6 py-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Diverges — Find hero
          </p>
          <h2 className="mt-2 font-serif text-3xl text-white">
            {DIVERGE.visionStreet}
          </h2>
          <p className="mt-2 font-mono text-sm text-white/70">
            {DIVERGE.visionStreet}, Westport, CT
          </p>
          {DIVERGE.diverge && DIVERGE.mlsStreet ? (
            <FindAddressDivergenceNote
              visionStreet={DIVERGE.visionStreet}
              mlsStreet={DIVERGE.mlsStreet}
              tone="dark"
            />
          ) : null}
        </section>

        <section className="mb-8 rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Ln / Lane — same street, no note
          </p>
          <h2 className="mt-2 font-serif text-2xl text-navy">
            {LOCUST.visionStreet}
          </h2>
          <p className="mt-1 font-mono text-sm text-slate/70">
            MLS {LOCUST.mlsStreet}. Case and Ln↔Lane are not a mismatch.
          </p>
          {LOCUST.diverge && LOCUST.mlsStreet ? (
            <FindAddressDivergenceNote
              visionStreet={LOCUST.visionStreet}
              mlsStreet={LOCUST.mlsStreet}
              tone="light"
            />
          ) : (
            <p className="mt-3 font-mono text-sm text-slate/70">
              Note hidden. Vision 5 LOCUST LN is MLS 5 Locust Lane.
            </p>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Same spelling — no note
          </p>
          <h2 className="mt-2 font-serif text-2xl text-navy">{SAME.visionStreet}</h2>
          {SAME.diverge && SAME.mlsStreet ? (
            <FindAddressDivergenceNote
              visionStreet={SAME.visionStreet}
              mlsStreet={SAME.mlsStreet}
              tone="light"
            />
          ) : (
            <p className="mt-3 font-mono text-sm text-slate/70">
              Note hidden. Vision and MLS both {SAME.visionStreet}.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            No MLS listing — no note
          </p>
          <h2 className="mt-2 font-serif text-2xl text-navy">
            {NO_MLS.visionStreet}
          </h2>
          {NO_MLS.diverge ? (
            <FindAddressDivergenceNote
              visionStreet={NO_MLS.visionStreet}
              mlsStreet={NO_MLS.mlsStreet ?? ""}
              tone="light"
            />
          ) : (
            <p className="mt-3 font-mono text-sm text-slate/70">
              Note hidden until a listing is linked.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
