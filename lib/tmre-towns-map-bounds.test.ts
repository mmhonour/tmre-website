import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundaryZipsForAllTowns,
  boundaryZipsForTown,
  mapBoundZipsForListing,
  mapBoundZipsForScope,
} from "./tmre-towns";

describe("mapBoundZipsForScope", () => {
  it("frames All Towns to every mappable TMRE zip even when a leftover zip is set", () => {
    const all = boundaryZipsForAllTowns();
    assert.deepEqual(mapBoundZipsForScope("All", "06890"), all);
    assert.deepEqual(mapBoundZipsForScope("All", null), all);
  });

  it("frames Fairfield to 06824 + 06825 + 06890 when no zip is selected", () => {
    assert.deepEqual(mapBoundZipsForScope("Fairfield", null), [
      "06824",
      "06825",
      "06890",
    ]);
    assert.deepEqual(
      mapBoundZipsForScope("Fairfield", null),
      boundaryZipsForTown("Fairfield"),
    );
  });

  it("frames a selected Fairfield zip to that zip only", () => {
    assert.deepEqual(mapBoundZipsForScope("Fairfield", "06890"), ["06890"]);
    assert.deepEqual(mapBoundZipsForScope("Fairfield", "06824"), ["06824"]);
  });

  it("ignores a zip that does not belong to the selected town", () => {
    assert.deepEqual(
      mapBoundZipsForScope("Fairfield", "06880"),
      boundaryZipsForTown("Fairfield"),
    );
  });

  it("ignores PO-box zips that have no ZCTA", () => {
    assert.deepEqual(
      mapBoundZipsForScope("Fairfield", "06828"),
      boundaryZipsForTown("Fairfield"),
    );
  });
});

describe("mapBoundZipsForListing", () => {
  it("frames a Fairfield listing to every mappable town zip, highlight on its own", () => {
    assert.deepEqual(mapBoundZipsForListing("Fairfield", "06825"), {
      boundZips: ["06824", "06825", "06890"],
      highlightZip: "06825",
    });
    assert.deepEqual(mapBoundZipsForListing(null, "06824"), {
      boundZips: ["06824", "06825", "06890"],
      highlightZip: "06824",
    });
  });

  it("falls back to one mappable zip when the town is unknown", () => {
    assert.deepEqual(mapBoundZipsForListing("Bridgeport", "06604"), {
      boundZips: ["06604"],
      highlightZip: "06604",
    });
  });
});
