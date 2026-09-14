import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceHeroInventoryTown,
  formatHeroPhotosInterruptedMessage,
  formatHeroPhotosJobMessage,
  HERO_PHOTOS_SKIP_MAX,
  mergeHeroPhotosSkipMlsIds,
  parseHeroInventoryCursor,
  parseHeroPhotosJobStatus,
  parseHeroPhotosSkipMlsIds,
  pctMissing,
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

  it("reports percent missing before, fill counts, and remaining percent", () => {
    assert.equal(
      formatHeroPhotosJobMessage(base),
      "was 87% missing (1,340/1,540) · filled 40 listings / 212 photos · now 84.4% missing",
    );
  });

  it("names listings this burst walked past because they stored nothing", () => {
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, filledListings: 0, filledPhotos: 0, walkedPast: 15 }),
      "was 87% missing (1,340/1,540) · filled 0 listings / 0 photos · walked past 15 that stored nothing · now 84.4% missing",
    );
    assert.equal(
      formatHeroPhotosJobMessage({
        ...base,
        running: true,
        filledListings: 0,
        filledPhotos: 0,
        walkedPast: 10,
      }),
      "running · 87% missing (1,340/1,540) · walked past 10 that stored nothing",
    );
  });

  it("shows % immediately while a burst is running", () => {
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, running: true, filledListings: 0, filledPhotos: 0 }),
      "running · 87% missing (1,340/1,540) · burst starting",
    );
    assert.equal(
      formatHeroPhotosJobMessage({ ...base, running: true }),
      "running · was 87% missing (1,340/1,540) · filled 40 listings / 212 photos so far",
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
      "idle · 0% missing · 1,540 Active with photos · 100% complete",
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
        complete: true,
        idle: true,
      }),
      "idle · was 87% missing · filled 5 listings / 30 photos · now 0% missing · 100% complete",
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
