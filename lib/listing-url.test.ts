import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingDetailHref,
  listingPhotoProxyUrl,
  listingPhotoProxyUrlAsFull,
  listingPhotosHref,
  listingSectionHref,
} from "./listing-url";

describe("listingPhotoProxyUrl", () => {
  it("asks for MLS mid-size on cards", () => {
    assert.equal(
      listingPhotoProxyUrl("24201214", 0),
      "/api/listings/24201214/photos/0?size=mid",
    );
    assert.equal(
      listingPhotoProxyUrl("24201214", 2, { size: "mid" }),
      "/api/listings/24201214/photos/2?size=mid",
    );
  });

  it("asks for full only when the gallery says so", () => {
    assert.equal(
      listingPhotoProxyUrl("24201214", 0, { size: "full" }),
      "/api/listings/24201214/photos/0?size=full",
    );
  });
});

describe("listingSectionHref", () => {
  it("opens the showcase overview, not a classic tab path", () => {
    assert.equal(listingDetailHref("24199886"), "/listings/24199886");
    assert.equal(
      listingSectionHref("24199886", "overview", "12 Main", "Westport"),
      "/listings/24199886?address=12+Main&city=Westport",
    );
  });

  it("sends photos / history / comps / if to showcase panel hashes", () => {
    assert.equal(
      listingSectionHref("24199886", "photos"),
      "/listings/24199886#showcase-photos",
    );
    assert.equal(
      listingPhotosHref("24199886", "12 Main", "Westport", 2),
      "/listings/24199886?photo=2&address=12+Main&city=Westport#showcase-photos",
    );
    assert.equal(
      listingSectionHref("24199886", "history"),
      "/listings/24199886#showcase-history",
    );
    assert.equal(
      listingSectionHref("24199886", "comparables"),
      "/listings/24199886#showcase-comps",
    );
    assert.equal(
      listingSectionHref("24199886", "if"),
      "/listings/24199886#showcase-if",
    );
  });
});

describe("listingPhotoProxyUrlAsFull", () => {
  it("upgrades a mid card URL to gallery full", () => {
    assert.equal(
      listingPhotoProxyUrlAsFull("/api/listings/24201214/photos/0?size=mid"),
      "/api/listings/24201214/photos/0?size=full",
    );
  });
});
