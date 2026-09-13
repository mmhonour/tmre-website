import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLatestViewState } from "./latest-view-state";

describe("parseLatestViewState", () => {
  it("keeps By town plus a selected town", () => {
    const state = parseLatestViewState(
      JSON.stringify({
        groupByTown: true,
        groupByZip: false,
        selectedTown: "Westport",
        selectedZip: null,
        townStatsOpen: false,
        collapsedGroups: [],
        collapseTouched: true,
        expandedGroups: ["Westport"],
        groupStatusFilter: {},
        scrollY: 240,
      }),
    );
    assert.ok(state);
    assert.equal(state.groupByTown, true);
    assert.equal(state.selectedTown, "Westport");
    assert.equal(state.scrollY, 240);
  });

  it("drops an unknown town so the day feed can open cleanly", () => {
    const state = parseLatestViewState(
      JSON.stringify({
        groupByTown: false,
        selectedTown: "NotATown",
      }),
    );
    assert.ok(state);
    assert.equal(state.groupByTown, false);
    assert.equal(state.selectedTown, null);
  });
});
