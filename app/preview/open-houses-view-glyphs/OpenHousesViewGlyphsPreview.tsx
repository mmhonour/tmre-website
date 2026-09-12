import type { OpenHouseEvent, OpenHouseListing, OpenHousesPageLoad } from "@/lib/open-houses";

const TODAY = "2026-09-12";
const SUNDAY = "2026-09-13";

function event(
  street: string,
  date: string,
  start = "11:00",
  end = "13:00",
): OpenHouseEvent {
  return {
    id: `${street}-${date}-${start}`,
    listingKey: street,
    listingId: street,
    date,
    startDateTime: `${date}T${start}:00`,
    endDateTime: `${date}T${end}:00`,
    type: "Public",
    comment: null,
  };
}

function fixture(
  city: string,
  zip: string,
  street: string,
  events: OpenHouseEvent[],
  extra?: Partial<OpenHouseListing>,
): OpenHouseListing {
  const next = events[0];
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
    price: 1_250_000,
    beds: 4,
    baths: 3,
    sqft: 2800,
    yearBuilt: 1960,
    dom: 4,
    photoCount: 0,
    status: "Active",
    ownerName: "Jane Owner",
    openHouses: events,
    nextOpenHouse: next,
    pastCount: 2,
    upcomingCount: events.length,
    weekOpenHouseCount: events.length,
    ...extra,
  };
}

const MAIN = event("2 Main St", TODAY);
const SEA = event("16 Sea Spray Rd", TODAY, "12:00", "14:00");
const SEA_SUN = event("16 Sea Spray Rd", SUNDAY, "13:00", "15:00");
const HARBOR = event("8 Harbor Rd", SUNDAY, "10:00", "12:00");
const COMPO = event("21 Compo Beach Rd", TODAY, "14:00", "16:00");
const LOCUST = event("5 Locust Ln", SUNDAY);
const RIDGE = event("12 Ridgefield Rd", TODAY);
const SILVER = event("71 Silvermine Avenue", TODAY);
const FOREST = event("176 Forest Street", SUNDAY);

const LISTINGS: OpenHouseListing[] = [
  fixture("Westport", "06880", "2 Main St", [MAIN], { pastCount: 12 }),
  fixture("Westport", "06880", "16 Sea Spray Rd", [SEA, SEA_SUN], {
    price: 2_195_000,
    beds: 5,
    baths: 4,
    pastCount: 8,
    weekOpenHouseCount: 2,
  }),
  fixture("Westport", "06880", "8 Harbor Rd", [HARBOR], {
    price: 1_595_000,
    pastCount: 5,
  }),
  fixture("Westport", "06880", "21 Compo Beach Rd", [COMPO], {
    price: 3_200_000,
    pastCount: 0,
  }),
  fixture("Wilton", "06897", "5 Locust Ln", [LOCUST], {
    price: 875_000,
    pastCount: 3,
  }),
  fixture("Wilton", "06897", "12 Ridgefield Rd", [RIDGE], {
    price: 1_050_000,
    pastCount: 0,
  }),
  fixture("Norwalk", "06850", "71 Silvermine Avenue", [SILVER], {
    price: 725_000,
    pastCount: 4,
  }),
  fixture("New Canaan", "06840", "176 Forest Street", [FOREST], {
    price: 1_875_000,
    pastCount: 1,
  }),
];

export const OPEN_HOUSES_VIEW_GLYPHS_FIXTURE: OpenHousesPageLoad = {
  ok: true,
  data: {
    listings: LISTINGS,
    generatedAt: `${TODAY}T12:00:00.000Z`,
    source: "db",
    syncedAt: `${TODAY}T11:00:00.000Z`,
    window: { start: TODAY, end: SUNDAY },
    windowLabel: "Saturday–Sunday (ET)",
    eventsFound: LISTINGS.reduce((sum, row) => sum + row.openHouses.length, 0),
    listingsMatched: LISTINGS.length,
  },
};

export const OPEN_HOUSES_VIEW_GLYPHS_OPEN_TOWNS = ["Westport"] as const;
