import Link from "next/link";
import {
  listingDetailHref,
  listingPhotosHref,
  listingSectionHref,
} from "@/lib/listing-url";

export const metadata = {
  title: "Preview — Listing showcase entry — TMRE",
  robots: { index: false, follow: false },
};

const SAMPLE_ID = "24199886";
const SAMPLE_STREET = "12 Main";
const SAMPLE_TOWN = "Westport";

const SITE_PAGES: readonly {
  page: string;
  path: string;
  how: string;
  lands: string;
}[] = [
  {
    page: "Latest / Closed (address, score)",
    path: "/latest · /closed",
    how: "listingDetailHref + from=/latest or /closed",
    lands: "Showcase overview",
  },
  {
    page: "Latest / Closed (photo)",
    path: "/latest · /closed",
    how: "DealBoardPrimaryPhoto with returnPath — was /photos (classic)",
    lands: "Showcase overview + Back to the feed",
  },
  {
    page: "Latest town-stats “Latest update”",
    path: "/latest",
    how: "listingDetailHref(mlsId, address, town)",
    lands: "Showcase overview",
  },
  {
    page: "Intelligence deal board",
    path: "/intelligence",
    how: "Address / photo: listingDetailHref with deal-board return",
    lands: "Showcase overview",
  },
  {
    page: "Intelligence listings",
    path: "/intelligence/listings",
    how: "listingDetailHref(mlsId, address, city)",
    lands: "Showcase overview",
  },
  {
    page: "Open Houses",
    path: "/open-houses",
    how: "listingDetailHref(mlsId, street) — no from=",
    lands: "Showcase overview",
  },
  {
    page: "Find / VGSI parcel",
    path: "/find",
    how: "listingDetailHref or /listings/{key} on map pins",
    lands: "Showcase overview",
  },
  {
    page: "Streets / mailing cards",
    path: "/find · streets",
    how: "streetListingCardHref → /listings/{id}",
    lands: "Showcase overview",
  },
  {
    page: "Looked at…",
    path: "/lookey",
    how: "listingDetailHref",
    lands: "Showcase overview",
  },
  {
    page: "New Construction / Expired",
    path: "/new-construction",
    how: "listingDetailHref",
    lands: "Showcase overview",
  },
  {
    page: "Fixer Uppers",
    path: "/fixer-uppers",
    how: "listingDetailHref",
    lands: "Showcase overview",
  },
  {
    page: "Deal of the Day / Week",
    path: "/deal-of-the-day · Home",
    how: "listingDetailHref; day photo used listingPhotosHref",
    lands: "Showcase (photo now #showcase-photos)",
  },
  {
    page: "Most viewed",
    path: "Home / cards",
    how: "`/listings/{mlsId}`",
    lands: "Showcase overview",
  },
  {
    page: "Stats tables",
    path: "/stats",
    how: "listingDetailHref",
    lands: "Showcase overview",
  },
  {
    page: "Comps / What if / History / UAG panels",
    path: "inside a listing",
    how: "listingDetailHref to the other property",
    lands: "Showcase overview",
  },
  {
    page: "Alert / share emails",
    path: "(mail)",
    how: "short /listings/{mlsId}",
    lands: "Showcase overview",
  },
  {
    page: "Admin photo health",
    path: "/admin",
    how: "hard `/listings/{id}/photos` bookmark",
    lands: "Showcase photos panel (same chrome)",
  },
  {
    page: "Home, About, Contact, Pulse, Rates, Trends, Budget, Score, Owner History, Investors, List With Me, Privacy, Terms",
    path: "site pages",
    how: "No property cards (or only Most viewed / DOTD as above)",
    lands: "—",
  },
];

export default function ListingShowcaseNavPreviewPage() {
  const overview = listingDetailHref(SAMPLE_ID, SAMPLE_STREET, SAMPLE_TOWN);
  const fromLatest = `${overview}${overview.includes("?") ? "&" : "?"}from=${encodeURIComponent("/latest")}`;
  const photos = listingPhotosHref(SAMPLE_ID, SAMPLE_STREET, SAMPLE_TOWN, 0);
  const history = listingSectionHref(
    SAMPLE_ID,
    "history",
    SAMPLE_STREET,
    SAMPLE_TOWN,
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing clicks open the showcase
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Latest / Closed thumbs used to open{" "}
          <code className="font-mono text-[12px]">/listings/…/photos</code>{" "}
          (classic chrome). Address, photo, and old tab paths now land on the
          full-bleed showcase. Fixture MLS {SAMPLE_ID} — links below are live
          shapes, not a promise that listing is in this environment.
        </p>

        <div className="mb-8 space-y-2 rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4 text-sm">
          <p className="font-medium text-navy">Latest-style hrefs</p>
          <p>
            <Link className="text-gold underline" href={fromLatest}>
              Address / photo
            </Link>
            <span className="ml-2 font-mono text-[11px] text-slate">
              {fromLatest}
            </span>
          </p>
          <p>
            <Link className="text-gold underline" href={photos}>
              Photos helper
            </Link>
            <span className="ml-2 font-mono text-[11px] text-slate">
              {photos}
            </span>
          </p>
          <p>
            <Link className="text-gold underline" href={history}>
              History helper
            </Link>
            <span className="ml-2 font-mono text-[11px] text-slate">
              {history}
            </span>
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal/[0.08] font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">How it links</th>
                <th className="px-4 py-3 font-medium">Lands on</th>
              </tr>
            </thead>
            <tbody>
              {SITE_PAGES.map((row) => (
                <tr
                  key={row.page}
                  className="border-b border-charcoal/[0.06] last:border-0"
                >
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-navy">{row.page}</p>
                    <p className="font-mono text-[11px] text-slate">
                      {row.path}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top text-slate">{row.how}</td>
                  <td className="px-4 py-3 align-top text-navy">{row.lands}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
