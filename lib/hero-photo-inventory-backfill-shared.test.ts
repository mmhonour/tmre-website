import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceHeroInventoryTown,
  formatHeroPhotosInterruptedMessage,
  formatHeroPhotosJobMessage,
  heroMissingPctAfter,
  HERO_PHOTOS_SKIP_MAX,
  HERO_SCAVENGE_EMPTY_ABORT_BATCHES,
  mergeHeroPhotosSkipMlsIds,
  parseHeroInventoryCursor,
  parseHeroPhotosJobStatus,
  parseHeroPhotosSkipMlsIds,
  pctMissing,
  shouldAbortHeroScavengeEmptyBurst,
  type HeroPhotosJobStatus,
} from "./hero-photo-inventory-backfill-shared";

const TOWNS = ["Norwalk", "Westport", "Wilton"] as const;

describe("parseHeroInventoryCursor", () => {
  it("defaults to the first town", () => {
    assert.deepEqual(parseHeroInventoryCursor(null, TOWNS), {
      town: "Norwalk",
      afterMlsId: "",
      cycle: 0,
    });
  });

  it("rejects a town that is not in coverage", () => {
    assert.equal(
      parseHeroInventoryCursor(
        JSON.stringify({ town: "Darien", afterMlsId: "x", cycle: 2 }),
        TOWNS,
      ).town,
      "Norwalk",
    );
  });
});

describe("advanceHeroInventoryTown", () => {
  it("walks to the next town and clears the mls cursor", () => {
    assert.deepEqual(
      advanceHeroInventoryTown(
        { town: "Norwalk", afterMlsId: "abc", cycle: 0 },
        TOWNS,
      ),
      { town: "Westport", afterMlsId: "", cycle: 0 },
    );
  });

  it("wraps and increments the cycle", () => {
    assert.deepEqual(
      advanceHeroInventoryTown(
        { town: "Wilton", afterMlsId: "z", cycle: 0 },
        TOWNS,
      ),
      { town: "Norwalk", afterMlsId: "", cycle: 1 },
    );
  });
});

describe("formatHeroPhotosJobMessage", () => {
  const base: HeroPhotosJobStatus = {
    generatedAt: "2026-09-14T12:00:00.000Z",
    activeWithPhotos: 1540,
    missingBefore: 1340,
    missingAfter: 1300,
    missingPctBefore: 87.0,
    missingPctAfter: 84.4,
    filledListings: 40,
    filledPhotos: 212,
    complete: false,
    idle: false,
    message: "",
  };

  it("reports a before/after snapshot: leftover counts on both sides", () => {
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, completedListings: 40 }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 40 listings with 212 photos (~5 avg / listing pushed to R2); 40 now fully in R2",
        "End 84.4% missing — 1,300 of 1,540 listings still have holes",
      ].join("\n"),
    );
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        activeWithPhotosAfter: 1550,
        missingAfter: 1295,
        missingPctAfter: 83.5,
        completedListings: 40,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 40 listings with 212 photos (~5 avg / listing pushed to R2); 40 now fully in R2",
        "End 83.5% missing — 1,295 of 1,550 listings still have holes",
      ].join("\n"),
    );
  });

  it("names listings this burst walked past because they stored nothing", () => {
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        filledListings: 0,
        filledPhotos: 0,
        walkedPast: 15,
        missingAfter: 1340,
        missingPctAfter: 87.0,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 0 listings with 0 photos",
        "Walked past 15 that stored nothing",
        "End 87% missing — 1,340 of 1,540 listings still have holes",
      ].join("\n"),
    );
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        running: true,
        filledListings: 0,
        filledPhotos: 0,
        walkedPast: 10,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Walked past 10 that stored nothing",
      ].join("\n"),
    );
  });

  it("says a wrap stall skipped empties so the next burst continues past them", () => {
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        filledListings: 0,
        filledPhotos: 0,
        walkedPast: 15,
        missingAfter: 1340,
        missingPctAfter: 87.0,
        stalledEmpty: true,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 0 listings with 0 photos",
        "Walked past 15 that stored nothing (next burst continues past them)",
        "End 87% missing — 1,340 of 1,540 listings still have holes",
      ].join("\n"),
    );
  });

  it("shows % immediately while a burst is running", () => {
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, running: true, filledListings: 0, filledPhotos: 0 }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Burst starting",
      ].join("\n"),
    );
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, running: true }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 40 listings with 212 photos so far (~5 avg / listing pushed to R2); 0 of those listings are fully in R2 yet",
      ].join("\n"),
    );
  });

  it("idles at 100% complete without a fill this run", () => {
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        missingBefore: 0,
        missingAfter: 0,
        missingPctBefore: 0,
        missingPctAfter: 0,
        filledListings: 0,
        filledPhotos: 0,
        complete: true,
        idle: true,
      }),
      [
        "Started 0% missing — 0 of 1,540 listings still have holes",
        "End 0% missing — 0 of 1,540 listings still have holes · 100% complete",
      ].join("\n"),
    );
  });

  it("keeps the previous % line when the runner vanishes mid-burst", () => {
    assert.equal(
      formatHeroPhotosInterruptedMessage(base, "runner stopped reporting — reaped"),
      "interrupted — runner stopped reporting — reaped",
    );
    assert.equal(
      formatHeroPhotosInterruptedMessage(
        { ...base, message: "was 87% missing (1,340/1,540) · filled 40 listings / 212 photos · now 84.4% missing" },
        "runner stopped reporting — reaped",
      ),
      "interrupted — runner stopped reporting — reaped · last: was 87% missing (1,340/1,540) · filled 40 listings / 212 photos · now 84.4% missing",
    );
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        interrupted: true,
        message: "interrupted — runner vanished · last: was 87% missing",
      }),
      "interrupted — runner vanished · last: was 87% missing",
    );
  });

  it("keeps the fill line when the burst finishes the last gaps", () => {
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        missingAfter: 0,
        missingPctAfter: 0,
        filledListings: 5,
        filledPhotos: 30,
        completedListings: 5,
        complete: true,
        idle: true,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 5 listings with 30 photos (~6 avg / listing pushed to R2); 5 now fully in R2",
        "End 0% missing — 0 of 1,540 listings still have holes · 100% complete",
      ].join("\n"),
    );
  });

  it("says leftover does not drop when filled listings still have holes", () => {
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        filledListings: 17,
        filledPhotos: 407,
        completedListings: 0,
        missingAfter: 1340,
        missingPctAfter: 87.0,
      }),
      [
        "Started 87% missing — 1,340 of 1,540 listings still have holes",
        "Filled 17 listings with 407 photos (~24 avg / listing pushed to R2); 0 of those listings are fully in R2 yet",
        "End 87% missing — 1,340 of 1,540 listings still have holes",
      ].join("\n"),
    );
  });
});

describe("parseHeroPhotosSkipMlsIds / mergeHeroPhotosSkipMlsIds", () => {
  it("reads a persisted skip list and ignores junk", () => {
    assert.deepEqual(parseHeroPhotosSkipMlsIds(null), []);
    assert.deepEqual(parseHeroPhotosSkipMlsIds("{"), []);
    assert.deepEqual(
      parseHeroPhotosSkipMlsIds(JSON.stringify({ ids: [" a ", "", 3, "b"] })),
      ["a", "b"],
    );
  });

  it("appends this burst and keeps the newest ids when over the cap", () => {
    assert.deepEqual(mergeHeroPhotosSkipMlsIds(["a", "b"], ["b", "c"]), [
      "a",
      "b",
      "c",
    ]);
    const persisted = Array.from({ length: HERO_PHOTOS_SKIP_MAX - 1 }, (_, i) => `old-${i}`);
    const merged = mergeHeroPhotosSkipMlsIds(persisted, ["new-1", "new-2"]);
    assert.equal(merged.length, HERO_PHOTOS_SKIP_MAX);
    assert.deepEqual(merged.slice(-2), ["new-1", "new-2"]);
    assert.equal(merged.includes("old-0"), false);
  });
});

describe("pctMissing / parseHeroPhotosJobStatus", () => {
  it("rounds missing percent to one decimal", () => {
    assert.equal(pctMissing(21, 1540), 1.4);
    assert.equal(pctMissing(0, 0), 0);
  });

  it("rejects junk and keeps a valid status message", () => {
    assert.equal(parseHeroPhotosJobStatus(null), null);
    assert.equal(parseHeroPhotosJobStatus("{"), null);
    const parsed = parseHeroPhotosJobStatus(
      JSON.stringify({
        generatedAt: "x",
        activeWithPhotos: 10,
        missingBefore: 2,
        missingAfter: 1,
        missingPctBefore: 20,
        missingPctAfter: 10,
        filledListings: 1,
        filledPhotos: 6,
        complete: false,
        idle: false,
        message: "was 20% missing",
      }),
    );
    assert.equal(parsed?.message, "was 20% missing");
    assert.equal(parsed?.filledPhotos, 6);
  });
});

describe("heroMissingPctAfter", () => {
  it("does not let a growing Active book pull % down when this burst stored nothing", () => {
    assert.equal(
      heroMissingPctAfter({
        missingAfter: 783,
        withPhotosBefore: 1742,
        withPhotosAfter: 1760,
        filledListings: 0,
        filledPhotos: 0,
      }),
      pctMissing(783, 1742),
    );
  });

  it("uses the after inventory when photos were actually stored", () => {
    assert.equal(
      heroMissingPctAfter({
        missingAfter: 770,
        withPhotosBefore: 1742,
        withPhotosAfter: 1760,
        filledListings: 5,
        filledPhotos: 30,
      }),
      pctMissing(770, 1760),
    );
  });
});

describe("shouldAbortHeroScavengeEmptyBurst", () => {
  it("keeps walking the first pass so leftovers behind unfillable oldest still get R2", () => {
    assert.equal(
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches: HERO_SCAVENGE_EMPTY_ABORT_BATCHES,
        filledPhotos: 0,
        filledListings: 0,
        wrappedSkip: false,
      }),
      false,
    );
    assert.equal(
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches: 20,
        filledPhotos: 0,
        filledListings: 0,
        wrappedSkip: false,
      }),
      false,
    );
  });

  it("stops after wrap plus three empty hops with zero fills", () => {
    assert.equal(
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches: HERO_SCAVENGE_EMPTY_ABORT_BATCHES,
        filledPhotos: 0,
        filledListings: 0,
        wrappedSkip: true,
      }),
      true,
    );
    assert.equal(
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches: HERO_SCAVENGE_EMPTY_ABORT_BATCHES - 1,
        filledPhotos: 0,
        filledListings: 0,
        wrappedSkip: true,
      }),
      false,
    );
    assert.equal(
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches: HERO_SCAVENGE_EMPTY_ABORT_BATCHES,
        filledPhotos: 1,
        filledListings: 1,
        wrappedSkip: true,
      }),
      false,
    );
  });
});
