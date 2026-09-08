import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCompactDollars } from "./stats-compact-dollars";

describe("formatCompactDollars", () => {
  it("uses millions and thousands", () => {
    assert.equal(formatCompactDollars(48_200_000), "$48.2M");
    assert.equal(formatCompactDollars(725_000), "$725K");
    assert.equal(formatCompactDollars(null), "—");
  });
});
