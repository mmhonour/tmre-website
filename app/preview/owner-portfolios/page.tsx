import { OwnerPortfoliosList } from "@/components/OwnerPortfoliosList";
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
        siteAddress: "1189 Greens Farms Road Ext",
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
        lastPaidSaleDate: null,
      },
    ],
  },
]);

const STREET_FIXTURES = pickUniqueOwnerPortfolios([
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
          Click Date or Amount to sort purchases in every panel (newest /
          highest first; click again to reverse). Each panel is an invisible
          three-column grid: address left, Date and Amount right-aligned so
          figures line up even when a sale date is missing. Production
          (admin): /streets/owners or Find → Landlord / owners.
        </p>
        <p className="mb-8 font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Find · Westport · Landlord / owners
        </p>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Town-wide
        </h2>
        <div className="mb-10">
          <OwnerPortfoliosList portfolios={TOWN_FIXTURES} />
        </div>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          On STONY PT RD (2+ on this street)
        </h2>
        <OwnerPortfoliosList
          portfolios={STREET_FIXTURES}
          homesNote="on this street"
        />
      </div>
    </div>
  );
}
