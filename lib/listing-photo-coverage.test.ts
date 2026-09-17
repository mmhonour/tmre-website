import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingPhotoIndicesAreContiguous,
  listingPhotosHaveRequiredSlots,
} from "./listing-photo-coverage";

describe("listingPhotoIndicesAreContiguous", () => {
  it("rejects empty and interior holes", () => {
    assert.equal(listingPhotoIndicesAreContiguous([]), false);
    assert.equal(listingPhotoIndicesAreContiguous([0, 1, 3]), false);
  });

  it("accepts a dense run, including a leading-empty offset", () => {
    assert.equal(listingPhotoIndicesAreContiguous([0, 1, 2]), true);
    assert.equal(listingPhotoIndicesAreContiguous([2, 3, 4]), true);
  });
});

describe("listingPhotosHaveRequiredSlots", () => {
  it("is false when nothing is stored", () => {
    assert.equal(listingPhotosHaveRequiredSlots([], 6), false);
  });

  it("treats a full 0..expected-1 run as complete", () => {
    assert.equal(listingPhotosHaveRequiredSlots([0, 1, 2, 3, 4, 5], 6), true);
  });

  it("allows leading RETS empties when the run ends on the last MLS slot", () => {
    assert.equal(listingPhotosHaveRequiredSlots([2, 3, 4, 5], 6), true);
  });

  it("is false when trailing slots are still missing", () => {
    assert.equal(listingPhotosHaveRequiredSlots([0, 1, 2], 6), false);
  });

  it("is false on an interior hole even if counts look close", () => {
    assert.equal(listingPhotosHaveRequiredSlots([0, 1, 2, 4, 5], 6), false);
  });

  it("does not require freshness — old complete galleries stay complete", () => {
    assert.equal(listingPhotosHaveRequiredSlots([0, 1], 2), true);
  });
});
