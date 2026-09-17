import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInsight, type ScoredListing } from "./goldilocks";
import type { Listing } from "./rets";

const EMPTY_SCORE = {
  age: 50,
  condition: 50,
  finishesQuality: 50,
  pricePerSqftFit: 50,
  layoutQuality: 50,
  schoolRating: 70,
  domRating: 50,
  composite: 50,
  weights: {
    age: 0.1,
    condition: 0.2,
    finishes: 0.2,
    ppsf: 0.2,
    layout: 0.15,
    schools: 0.1,
    dom: 0.05,
  },
};

function listing(partial: Partial<Listing> = {}): Listing {
  return {
    mlsId: "1",
    listingKey: "1",
    status: "Active",
    propertyType: "Single Family For Sale",
    style: "Colonial",
    address: {
      street: "1 Main",
      unit: "",
      city: "Westport",
      state: "CT",
      postalCode: "06880",
      full: "1 Main, Westport, CT 06880",
    },
    price: 1_000_000,
    originalListPrice: 1_000_000,
    beds: 4,
    baths: 3,
    sqft: 2500,
    lotAcres: 0.5,
    furnished: null,
    yearBuilt: 1990,
    dom: 10,
    listDate: null,
    modificationTimestamp: null,
    priceChangeTimestamp: null,
    statusChangeTimestamp: null,
    latitude: null,
    longitude: null,
    photoCount: 10,
    ownerName: null,
    remarks: null,
    schools: { elementary: null, middle: null, high: null, district: null },
    raw: {},
    ...partial,
  };
}

function scored(
  listingPartial: Partial<Listing> = {},
  remarksMatched: Partial<ScoredListing["remarksMatched"]> = {},
): ScoredListing {
  return {
    listing: listing(listingPartial),
    kind: "sale",
    score: EMPTY_SCORE,
    pricePerSqft: null,
    cityMedianPpsf: null,
    cityPriceTop15: null,
    remarksMatched: {
      reno: [],
      quality: [],
      lowQuality: [],
      goodLayout: [],
      badLayout: [],
      ...remarksMatched,
    },
  };
}

describe("buildInsight photo grammar", () => {
  it("uses singular photo language when there is only one picture", () => {
    const text = buildInsight(scored({ photoCount: 1 }));
    assert.match(text, /Only one photo is online/);
    assert.doesNotMatch(text, /photos/i);
    assert.doesNotMatch(text, /a couple of photo/i);
    assert.doesNotMatch(text, /a few photo/i);
  });

  it("keeps plural language for two pictures", () => {
    const text = buildInsight(scored({ photoCount: 2 }));
    assert.match(text, /Only a couple of photos are online/);
  });

  it("uses singular photo language on a one-photo new build", () => {
    const text = buildInsight(scored({ photoCount: 1, yearBuilt: 2024 }));
    assert.match(text, /Only one photo is online/);
    assert.doesNotMatch(text, /photos/i);
  });
});

describe("buildInsight land listings", () => {
  it("does not mention rooms or a home when the type is lots/land", () => {
    const text = buildInsight(
      scored(
        {
          propertyType: "Lots/Land For Sale",
          style: "",
          beds: 0,
          baths: 0,
          sqft: null,
          yearBuilt: null,
          photoCount: 4,
        },
        { reno: ["updated"], quality: ["custom"] },
      ),
    );
    assert.doesNotMatch(text, /room/i);
    assert.doesNotMatch(text, /\bhome\b/i);
    assert.doesNotMatch(text, /floor plan/i);
    assert.doesNotMatch(text, /finishes/i);
    assert.match(text, /lot/);
  });

  it("does not mention rooms when Residential + Vacant Land subtype", () => {
    const text = buildInsight(
      scored({
        propertyType: "Residential",
        style: "",
        beds: 0,
        baths: 0,
        sqft: null,
        photoCount: 5,
        raw: { PropertySubType: "Vacant Land" },
      }),
    );
    assert.doesNotMatch(text, /room/i);
    assert.match(text, /lot/);
  });

  it("still describes rooms on a house with update remarks and several photos", () => {
    const text = buildInsight(
      scored({ photoCount: 4 }, { reno: ["updated"] }),
    );
    assert.match(text, /from room to room/);
  });
});
