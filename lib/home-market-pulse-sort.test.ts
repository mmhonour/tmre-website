import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareHomePulseValues,
  nextHomePulseSort,
} from "./home-market-pulse-sort";

describe("nextHomePulseSort", () => {
  it("starts descending on a new label", () => {
    assert.deepEqual(nextHomePulseSort(null, "desc", "medianPrice"), {
      key: "medianPrice",
      dir: "desc",
    });
  });

  it("toggles direction on the same label", () => {
    assert.deepEqual(nextHomePulseSort("medianPrice", "desc", "medianPrice"), {
      key: "medianPrice",
      dir: "asc",
    });
    assert.deepEqual(nextHomePulseSort("medianPrice", "asc", "medianPrice"), {
      key: "medianPrice",
      dir: "desc",
    });
  });

  it("resets to descending when switching labels", () => {
    assert.deepEqual(nextHomePulseSort("medianPrice", "asc", "monthsSupply"), {
      key: "monthsSupply",
      dir: "desc",
    });
  });
});

describe("compareHomePulseValues", () => {
  it("sorts descending with nulls last", () => {
    const rows = [1, null, 9, 3];
    const sorted = [...rows].sort((a, b) => compareHomePulseValues(a, b, "desc"));
    assert.deepEqual(sorted, [9, 3, 1, null]);
  });
});
