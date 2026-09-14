import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expiredRetsSearchParams,
  omitMlsStatusWithDateWindow,
} from "./rets-dmql";

describe("omitMlsStatusWithDateWindow", () => {
  it("omits Closed and Expired so SmartMLS does not return NO_RECORDS_FOUND", () => {
    assert.equal(omitMlsStatusWithDateWindow("Closed"), true);
    assert.equal(omitMlsStatusWithDateWindow("C"), true);
    assert.equal(omitMlsStatusWithDateWindow("Expired"), true);
    assert.equal(omitMlsStatusWithDateWindow("X"), true);
    assert.equal(omitMlsStatusWithDateWindow("expired"), true);
  });

  it("keeps MLSStatus for live inventory", () => {
    assert.equal(omitMlsStatusWithDateWindow("Active"), false);
    assert.equal(omitMlsStatusWithDateWindow("Coming Soon"), false);
    assert.equal(omitMlsStatusWithDateWindow("Under Contract"), false);
  });
});

describe("expiredRetsSearchParams", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("always sends a StatusChange window (Closed-style)", () => {
    const params = expiredRetsSearchParams({
      limit: 500,
      closedSince: "2019-01-01",
      now,
    });
    assert.equal(params.status, "Expired");
    assert.equal(params.closedAfter, "2019-01-01");
    assert.equal(params.closedBefore, "2026-09-14");
    assert.equal(params.limit, 500);
  });

  it("caps closedBefore when asking for 30+ day expiries", () => {
    const params = expiredRetsSearchParams({
      limit: 200,
      minAgeDays: 30,
      closedSince: "2019-01-01",
      now,
    });
    assert.equal(params.closedAfter, "2019-01-01");
    assert.equal(params.closedBefore, "2026-08-15");
  });
});
