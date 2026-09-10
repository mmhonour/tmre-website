import { groupOpenHousesByTownAndDay } from "@/lib/open-houses-groups";
import type { OpenHouseListing } from "@/lib/open-houses";

export const metadata = {
  title: "Preview — Open houses by town and day — TMRE",
  robots: { index: false, follow: false },
};

function fixture(
  city: string,
  zip: string,
  date: string,
  street: string,
): OpenHouseListing {
  const event = {
    id: `${street}-${date}`,
    listingKey: street,
    listingId: street,
    date,
    startDateTime: `${date}T11:00:00`,
    endDateTime: `${date}T13:00:00`,
    type: "Public",
    comment: null,
  };
  return {
    mlsId: street,
    propertyType: "Single Family For Sale",
    style: "Colonial",
    address: {
      street,
      unit: "",
      city,
      state: "CT",
      postalCode: zip,
      full: `${street}, ${city}, CT ${zip}`,
    },
    price: 1250000,
    beds: 4,
    baths: 3,
    sqft: 2800,
    yearBuilt: 1960,
    dom: 4,
    photoCount: 0,
    status: "Active",
    ownerName: null,
    openHouses: [event],
    nextOpenHouse: event,
    pastCount: 1,
    upcomingCount: 1,
  };
}

const TODAY = "2026-09-10";
const GROUPS = groupOpenHousesByTownAndDay(
  [
    fixture("Westport", "06880", "2026-09-12", "2 Main St"),
    fixture("Westport", "06880", "2026-09-10", "16 Sea Spray Rd"),
    fixture("Wilton", "06897", "2026-09-10", "5 Locust Ln"),
  ],
  { today: TODAY, townOrder: ["Westport", "Wilton"] },
);

export default function OpenHousesTownDayPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Open houses by town and day
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture week of 10 Sep 2026. Towns first, then Today / Tomorrow /
          weekday. Friday has no showing so it is omitted. Production:
          /open-houses.
        </p>
        <div className="space-y-10">
          {GROUPS.map((town) => (
            <section key={town.town}>
              <h2 className="mb-4 font-serif text-2xl text-navy">{town.town}</h2>
              <div className="space-y-4">
                {town.days.map((day) => (
                  <div key={day.date}>
                    <p className="mb-2 font-mono text-[11px] tracking-[0.14em] uppercase text-slate">
                      {day.label}
                    </p>
                    <ul className="space-y-1">
                      {day.listings.map((listing) => (
                        <li
                          key={listing.mlsId}
                          className="font-mono text-sm text-navy"
                        >
                          {listing.address.street}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
