import { OwnerPortfolioHomes } from "@/components/OwnerPortfolioHomes";
import { pickUniqueOwnerPortfolios } from "@/lib/vision-owner-keys";

export const metadata = {
  title: "Preview — Owner portfolios — TMRE",
  robots: { index: false, follow: false },
};

const TOWN_FIXTURES = pickUniqueOwnerPortfolios([
  {
    clusterId: "mailing:po box 88|westport",
    clusterKind: "mailing",
    town: "Westport",
    displayName: "Albert King",
    relationship: "owner",
    mailingLabel: "po box 88, westport",
    parcelCount: 3,
    parcels: [
      {
        town: "Westport",
        visionPid: "1565",
        siteAddress: "12 Main St",
        lastPaidPrice: 2_150_000,
        lastPaidPriceLabel: "$2,150,000",
        lastPaidSaleDate: "04/12/2019",
      },
      {
        town: "Westport",
        visionPid: "200",
        siteAddress: "40 Compo Rd",
        lastPaidPrice: 1_875_000,
        lastPaidPriceLabel: "$1,875,000",
        lastPaidSaleDate: "09/03/2016",
      },
      {
        town: "Westport",
        visionPid: "201",
        siteAddress: "8 Beachside Ave",
        lastPaidPrice: 3_400_000,
        lastPaidPriceLabel: "$3,400,000",
        lastPaidSaleDate: "07/22/2021",
      },
    ],
  },
  {
    clusterId: "name:king|albert",
    clusterKind: "name",
    town: "Westport",
    displayName: "Albert King",
    relationship: "landlord",
    mailingLabel: null,
    parcelCount: 2,
    parcels: [
      {
        town: "Westport",
        visionPid: "1565",
        siteAddress: "12 Main St",
        lastPaidPrice: 2_150_000,
        lastPaidPriceLabel: "$2,150,000",
        lastPaidSaleDate: "04/12/2019",
      },
      {
        town: "Westport",
        visionPid: "200",
        siteAddress: "40 Compo Rd",
        lastPaidPrice: 1_875_000,
        lastPaidPriceLabel: "$1,875,000",
        lastPaidSaleDate: "09/03/2016",
      },
    ],
  },
  {
    clusterId: "name:denise|penna",
    clusterKind: "name",
    town: "Westport",
    displayName: "Denise Penna",
    relationship: "landlord",
    mailingLabel: null,
    parcelCount: 2,
    parcels: [
      {
        town: "Westport",
        visionPid: "4100",
        siteAddress: "12 Compo Rd S",
        lastPaidPrice: 850_000,
        lastPaidPriceLabel: "$850,000",
        lastPaidSaleDate: "03/15/2012",
      },
      {
        town: "Westport",
        visionPid: "4101",
        siteAddress: "88 Hillspoint Rd",
        lastPaidPrice: 1_200_000,
        lastPaidPriceLabel: "$1,200,000",
        lastPaidSaleDate: "08/01/2018",
      },
    ],
  },
]);

export default function OwnerPortfoliosPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Owner portfolios (2+ homes)
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture list — largest first. The current (non-superseded)
          warranty name on two or more homes is a landlord (Denise
          Penna). A later warranty replaces the prior buyer; a later
          quitclaim does not. Same mailbox is an owner cluster. Last
          paid close date sits to the left of the price on the right
          side of each row; purchase total at the bottom of the panel.
          Production (admin): /streets/owners or Find → Landlord /
          owners.
        </p>
        <p className="mb-8 font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Find · Westport · Landlord / owners
        </p>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Town-wide
        </h2>
        <ol className="mb-10 space-y-5">
          {TOWN_FIXTURES.map((row) => (
            <li
              key={row.clusterId}
              className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-navy">{row.displayName}</h2>
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                  {row.parcelCount} homes
                  {row.relationship === "landlord"
                    ? " · landlord"
                    : " · same mailing"}
                </p>
              </div>
              <OwnerPortfolioHomes
                parcels={row.parcels}
                purchaseTotalLabel={row.lastPaidTotalLabel}
              />
            </li>
          ))}
        </ol>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          On STONY PT RD (2+ on this street)
        </h2>
        <ol className="space-y-5">
          {pickUniqueOwnerPortfolios([
            {
              clusterId: "mailing:2a stony pt rd|westport",
              clusterKind: "mailing",
              town: "Westport",
              displayName: "CASTILLO EDWARD AND SNYDER CAMERON",
              relationship: "owner",
              mailingLabel: "2a stony pt rd, westport",
              parcelCount: 2,
              parcels: [
                {
                  town: "Westport",
                  visionPid: "5384",
                  siteAddress: "2A STONY PT RD",
                  lastPaidPrice: 1_530_000,
                  lastPaidPriceLabel: "$1,530,000",
                  lastPaidSaleDate: "11/03/2014",
                },
                {
                  town: "Westport",
                  visionPid: "5385",
                  siteAddress: "2B STONY PT RD",
                  lastPaidPrice: 1_275_000,
                  lastPaidPriceLabel: "$1,275,000",
                  lastPaidSaleDate: "05/20/2015",
                },
              ],
            },
          ]).map((row) => (
            <li
              key={row.clusterId}
              className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-navy">{row.displayName}</h2>
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                  {row.parcelCount} homes on this street
                </p>
              </div>
              <OwnerPortfolioHomes
                parcels={row.parcels}
                purchaseTotalLabel={row.lastPaidTotalLabel}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
