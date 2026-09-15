import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALERT_LEAD_PHOTO_WARM_CAP,
  takeAlertLeadPhotoMlsIds,
} from "./listing-alert-photo-warm-shared";

describe("takeAlertLeadPhotoMlsIds", () => {
  it("dedupes, trims, and keeps first-seen order", () => {
    assert.deepEqual(takeAlertLeadPhotoMlsIds([" 24206418 ", "24186351", "24206418", ""]), [
      "24206418",
      "24186351",
    ]);
  });

  it("caps so an OH window cannot stall the pull on Media", () => {
    const ids = Array.from({ length: ALERT_LEAD_PHOTO_WARM_CAP + 5 }, (_, i) => `id-${i}`);
    const taken = takeAlertLeadPhotoMlsIds(ids);
    assert.equal(taken.length, ALERT_LEAD_PHOTO_WARM_CAP);
    assert.equal(taken[0], "id-0");
    assert.equal(taken.at(-1), `id-${ALERT_LEAD_PHOTO_WARM_CAP - 1}`);
  });
});
