import {
  visionListingSaleRole,
  visionParcelMlsPrice,
} from "@/lib/vision-listing-sale-match";

export const metadata = {
  title: "Preview — Vision deed vs prior MLS ask — TMRE",
  robots: { index: false, follow: false },
};

const PAID = { date: "08/30/2017", year: 2017, price: 1_700_000 };
const LAND = {
  status: "Closed",
  price: 575_000,
  raw: { ClosePrice: "540000", CloseDate: "2016-07-29" },
};
const HOUSE = {
  status: "Closed",
  price: 1_750_000,
  raw: { ClosePrice: "1700000", CloseDate: "2017-08-15" },
};

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US")}`;
}

export default function FindDeedVsPriorPreviewPage() {
  const landRole = visionListingSaleRole(LAND, PAID);
  const houseRole = visionListingSaleRole(HOUSE, PAID);
  const pagePrice = visionParcelMlsPrice(LAND, PAID);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Vision deed, not a prior ask
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          The VGSI parcel page shows the last paid assessor sale. A Closed MLS
          row is the page listing only when close date and price are that deed.
          Fixture: Vision $1,700,000 on 08/30/2017 vs a 2016 land list at
          $575,000.
        </p>

        <section className="mb-8 rounded-2xl bg-[#131F38] px-6 py-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Find / Streets hero
          </p>
          <h2 className="mt-2 font-serif text-3xl text-white">5 LOCUST LN</h2>
          <p className="mt-2 font-mono text-sm text-white/70">
            5 LOCUST LN, Westport, CT
          </p>
          <p className="mt-4 font-mono text-2xl text-gold tabular-nums">
            {money(pagePrice)}
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            Vision last paid · land MLS is {landRole} (not shown)
          </p>
          <p className="mt-3 font-mono text-sm text-white/80 tabular-nums">
            Bought 08/30/2017 · $1,700,000
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Hidden — prior land close
          </p>
          <p className="mt-2 font-mono text-sm text-slate">
            MLS #99146518 · Lots and Land · listed $575,000 · closed $540,000
            on 2016-07-29. Role: {landRole}. Streets does not print Closed ·
            $575,000.
          </p>
        </section>

        <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
            Shown — MLS that is the deed
          </p>
          <p className="mt-2 font-mono text-sm text-slate">
            Closed $1,700,000 on 2017-08-15. Role: {houseRole}. Price{" "}
            {money(visionParcelMlsPrice(HOUSE, PAID))}.
          </p>
        </section>
      </div>
    </div>
  );
}
