import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLOSED_MEDIAN_LOOKBACK_MONTHS,
  medianClosedInLookback,
  townClosedMedianKey,
} from "./closed-median-12mo";

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

function closedSale(
  closePrice: number,
  closeDate: string,
  extras?: { propertyType?: string },
) {
  return {
    status: "Closed",
    price: closePrice,
    propertyType: extras?.propertyType ?? "Single Family",
    raw: {
      ClosePrice: String(closePrice),
      CloseDate: closeDate,
    },
  };
}

describe("medianClosedInLookback", () => {
  it("is a 12-month window", () => {
    assert.equal(CLOSED_MEDIAN_LOOKBACK_MONTHS, 12);
  });

  it("uses closed prices from the last 12 months only", () => {
    const rows = [
      closedSale(1_000_000, "2025-10-01"),
      closedSale(2_000_000, "2026-03-01"),
      closedSale(3_000_000, "2026-06-01"),
      closedSale(9_000_000, "2024-01-01"),
    ];
    const result = medianClosedInLookback(rows, "sale", NOW);
    assert.equal(result.count, 3);
    assert.equal(result.median, 2_000_000);
  });

  it("ignores active list prices", () => {
    const rows = [
      closedSale(2_000_000, "2026-06-01"),
      {
        status: "Active",
        price: 12_000_000,
        propertyType: "Single Family",
        raw: {},
      },
    ];
    const result = medianClosedInLookback(rows, "sale", NOW);
    assert.equal(result.count, 1);
    assert.equal(result.median, 2_000_000);
  });

  it("keeps sale and rental pools apart", () => {
    const rows = [
      closedSale(2_000_000, "2026-06-01"),
      {
        status: "Closed",
        price: 4_000,
        propertyType: "Rental",
        raw: { ClosePrice: "4000", CloseDate: "2026-06-01" },
      },
    ];
    assert.equal(medianClosedInLookback(rows, "sale", NOW).median, 2_000_000);
    assert.equal(medianClosedInLookback(rows, "rental", NOW).median, 4_000);
  });
});

describe("townClosedMedianKey", () => {
  it("lowercases town and kind", () => {
    assert.equal(townClosedMedianKey("Westport", "sale"), "westport::sale");
  });
});
