import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INCREMENTAL_PHOTO_WARM_QUEUE_CAP,
  mergeIncrementalPhotoWarmQueue,
} from "./incremental-photo-warm-shared";

describe("mergeIncrementalPhotoWarmQueue", () => {
  it("dedupes and keeps arrival order", () => {
    assert.deepEqual(
      mergeIncrementalPhotoWarmQueue(["24111", "24122"], ["24122", "24133"]),
      ["24111", "24122", "24133"],
    );
  });

  it("keeps the newest ids when over cap", () => {
    const existing = Array.from({ length: INCREMENTAL_PHOTO_WARM_QUEUE_CAP }, (_, i) =>
      `old-${i}`,
    );
    const next = mergeIncrementalPhotoWarmQueue(existing, ["new-a", "new-b"]);
    assert.equal(next.length, INCREMENTAL_PHOTO_WARM_QUEUE_CAP);
    assert.equal(next.at(-1), "new-b");
    assert.equal(next.at(-2), "new-a");
    assert.ok(!next.includes("old-0"));
  });

  it("ignores blank ids", () => {
    assert.deepEqual(mergeIncrementalPhotoWarmQueue(["  "], [" 24144 "]), ["24144"]);
  });
});
