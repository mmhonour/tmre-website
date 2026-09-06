import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureTownOpen,
  parseTownDeckOpen,
  parseTownDeckOrder,
  placeTownRelativeTo,
  serializeTowns,
  toggleTownOpen,
} from "./stats-town-deck";

describe("parseTownDeckOrder", () => {
  it("keeps a saved order and appends missing towns", () => {
    assert.deepEqual(parseTownDeckOrder("Westport,Wilton"), [
      "Westport",
      "Wilton",
      "Norwalk",
      "New Canaan",
      "Weston",
      "Fairfield",
      "Ridgefield",
    ]);
  });

  it("ignores junk and uses the fallback when empty", () => {
    assert.deepEqual(parseTownDeckOrder("", ["Ridgefield", "Westport"] as const).slice(0, 2), [
      "Ridgefield",
      "Westport",
    ]);
  });
});

describe("parseTownDeckOpen", () => {
  it("returns unique valid towns", () => {
    assert.deepEqual(parseTownDeckOpen("Westport,Nope,Westport,Wilton"), [
      "Westport",
      "Wilton",
    ]);
  });
});

describe("placeTownRelativeTo", () => {
  const order = ["Norwalk", "Westport", "Wilton"] as const;

  it("moves a town immediately before the target", () => {
    assert.deepEqual(placeTownRelativeTo(order, "Wilton", "Norwalk", true), [
      "Wilton",
      "Norwalk",
      "Westport",
    ]);
  });

  it("moves a town immediately after the target", () => {
    assert.deepEqual(placeTownRelativeTo(order, "Norwalk", "Wilton", false), [
      "Westport",
      "Wilton",
      "Norwalk",
    ]);
  });

  it("is a no-op when dropped on itself", () => {
    assert.deepEqual(placeTownRelativeTo(order, "Westport", "Westport", true), [
      "Norwalk",
      "Westport",
      "Wilton",
    ]);
  });
});

describe("open helpers", () => {
  it("toggles and ensures open towns", () => {
    assert.deepEqual(toggleTownOpen(["Westport"], "Westport"), []);
    assert.deepEqual(toggleTownOpen([], "Wilton"), ["Wilton"]);
    assert.deepEqual(ensureTownOpen(["Westport"], "Westport"), ["Westport"]);
    assert.deepEqual(ensureTownOpen(["Westport"], "Wilton"), ["Westport", "Wilton"]);
  });

  it("round-trips serialize", () => {
    assert.equal(serializeTowns(["Westport", "Wilton"]), "Westport,Wilton");
  });
});
