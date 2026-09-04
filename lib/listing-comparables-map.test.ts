import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compsMapLayers,
  defaultCompsMapLayer,
  listingComparablesApiUrl,
  resolveCompsMapFetchUrls,
} from "./listing-comparables-map";

describe("listing-comparables-map", () => {
  it("appends kind=rental on the default listing API", () => {
    assert.equal(
      listingComparablesApiUrl("24180781", "sale"),
      "/api/listings/24180781/comparables",
    );
    assert.equal(
      listingComparablesApiUrl("24180781", "rental"),
      "/api/listings/24180781/comparables?kind=rental",
    );
    assert.equal(
      listingComparablesApiUrl("24180781", "rental", "/api/spotlight/comparables?kind=rental"),
      "/api/spotlight/comparables?kind=rental",
    );
  });

  it("keeps a compact sale map on sales only", () => {
    const layers = compsMapLayers({ subjectKind: "sale", roomy: false });
    assert.deepEqual(
      layers.map((l) => l.id),
      ["active-sale", "closed"],
    );
    assert.equal(defaultCompsMapLayer("sale"), "active-sale");
  });

  it("adds for-rent when the sale map has room", () => {
    const layers = compsMapLayers({ subjectKind: "sale", roomy: true });
    assert.deepEqual(
      layers.map((l) => l.id),
      ["active-sale", "active-rental", "closed"],
    );
    assert.equal(layers.find((l) => l.id === "active-rental")?.label, "For rent");
  });

  it("plots rentals on a rental subject even when compact", () => {
    const compact = compsMapLayers({ subjectKind: "rental", roomy: false });
    assert.deepEqual(
      compact.map((l) => l.id),
      ["active-rental", "closed"],
    );
    assert.equal(compact[0]?.label, "For rent");
    assert.equal(compact[1]?.label, "Rented");
    assert.equal(defaultCompsMapLayer("rental"), "active-rental");
  });

  it("adds for-sale when the rental map has room", () => {
    const layers = compsMapLayers({ subjectKind: "rental", roomy: true });
    assert.deepEqual(
      layers.map((l) => l.id),
      ["active-rental", "active-sale", "closed"],
    );
  });

  it("uses fetchUrl as the rental override on a rental subject", () => {
    const urls = resolveCompsMapFetchUrls("24180781", {
      subjectKind: "rental",
      fetchUrl: "/api/spotlight/comparables?kind=rental",
    });
    assert.equal(urls.rental, "/api/spotlight/comparables?kind=rental");
    assert.equal(urls.sale, "/api/listings/24180781/comparables");
  });
});
