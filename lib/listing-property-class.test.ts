import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLandPropertyType,
  listingLooksLikeLand,
} from "./listing-property-class";

describe("isLandPropertyType", () => {
  it("matches MLS lots/land labels", () => {
    assert.equal(isLandPropertyType("Lots/Land For Sale"), true);
    assert.equal(isLandPropertyType("Land"), true);
    assert.equal(isLandPropertyType("Vacant Land"), true);
    assert.equal(isLandPropertyType("Building Lot"), true);
    assert.equal(isLandPropertyType("Lots and Land"), true);
  });

  it("does not treat houses or island as land", () => {
    assert.equal(isLandPropertyType("Single Family For Sale"), false);
    assert.equal(isLandPropertyType("Residential"), false);
    assert.equal(isLandPropertyType("Island Colonial"), false);
  });
});

describe("listingLooksLikeLand", () => {
  it("reads PropertySubType when PropertyType is Residential", () => {
    assert.equal(
      listingLooksLikeLand({
        propertyType: "Residential",
        style: "",
        raw: { PropertySubType: "Vacant Land" },
      }),
      true,
    );
  });

  it("is false for a typical house", () => {
    assert.equal(
      listingLooksLikeLand({
        propertyType: "Single Family For Sale",
        style: "Colonial",
        raw: {},
      }),
      false,
    );
  });
});
