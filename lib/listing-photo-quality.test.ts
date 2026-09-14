import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cacheSatisfiesQuality,
  fullCacheOutrankedByMid,
  listingPhotoCardCacheId,
  listingPhotoQualityFromSizeParam,
} from "./listing-photo-quality";

describe("listingPhotoQualityFromSizeParam", () => {
  it("defaults cards to mid (no size, size=mid, unknown)", () => {
    assert.equal(listingPhotoQualityFromSizeParam(null), "mid");
    assert.equal(listingPhotoQualityFromSizeParam("mid"), "mid");
    assert.equal(listingPhotoQualityFromSizeParam(""), "mid");
    assert.equal(listingPhotoQualityFromSizeParam("thumb"), "mid");
  });

  it("keeps gallery full and legacy display", () => {
    assert.equal(listingPhotoQualityFromSizeParam("full"), "full");
    assert.equal(listingPhotoQualityFromSizeParam("display"), "display");
  });
});

describe("listingPhotoCardCacheId", () => {
  it("uses a separate __card id and is idempotent", () => {
    assert.equal(listingPhotoCardCacheId("24201214"), "24201214__card");
    assert.equal(
      listingPhotoCardCacheId("24201214__card"),
      "24201214__card",
    );
    assert.equal(listingPhotoCardCacheId("  "), "");
  });
});

describe("cacheSatisfiesQuality", () => {
  it("rejects a 3MB full blob as a mid/card hit", () => {
    assert.equal(cacheSatisfiesQuality(3_000_000, "mid"), false);
    assert.equal(cacheSatisfiesQuality(3_000_000, "full"), true);
  });

  it("accepts a typical mid JPEG for cards", () => {
    assert.equal(cacheSatisfiesQuality(180_000, "mid"), true);
    assert.equal(cacheSatisfiesQuality(900_000, "mid"), true);
    assert.equal(cacheSatisfiesQuality(180_000, "full"), true);
  });

  it("rejects a tiny thumb as full or mid", () => {
    assert.equal(cacheSatisfiesQuality(2_000, "mid"), false);
    assert.equal(cacheSatisfiesQuality(2_000, "full"), false);
  });
});

describe("fullCacheOutrankedByMid", () => {
  it("rejects a full slot smaller than its mid sibling (thumb stored as full)", () => {
    assert.equal(fullCacheOutrankedByMid(84_942, 171_585), true);
    assert.equal(fullCacheOutrankedByMid(82_915, 169_831), true);
  });

  it("keeps a real MediaURL full that is larger than mid", () => {
    assert.equal(fullCacheOutrankedByMid(3_587_383, 101_536), false);
    assert.equal(fullCacheOutrankedByMid(7_577_312, 167_489), false);
  });

  it("leaves vintage small MediaURL fulls alone when mid is missing or smaller", () => {
    assert.equal(fullCacheOutrankedByMid(36_000, null), false);
    assert.equal(fullCacheOutrankedByMid(36_000, undefined), false);
    assert.equal(fullCacheOutrankedByMid(36_000, 20_000), false);
    assert.equal(fullCacheOutrankedByMid(80, 200_000), false);
  });
});
