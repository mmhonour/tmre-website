import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceHeroInventoryTown,
  parseHeroInventoryCursor,
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
