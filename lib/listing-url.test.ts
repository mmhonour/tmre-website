import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingPhotoProxyUrl,
  listingPhotoProxyUrlAsFull,
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

describe("listingPhotoProxyUrlAsFull", () => {
  it("upgrades a mid card URL to gallery full", () => {
    assert.equal(
      listingPhotoProxyUrlAsFull("/api/listings/24201214/photos/0?size=mid"),
      "/api/listings/24201214/photos/0?size=full",
    );
  });
});
