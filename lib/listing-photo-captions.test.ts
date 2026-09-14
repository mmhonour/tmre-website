import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingPhotoCaptionsFromMedia,
  mediaRecordCaption,
} from "./listing-photo-captions";

describe("mediaRecordCaption", () => {
  it("prefers the agent ShortDescription over ImageOf", () => {
    assert.equal(
      mediaRecordCaption({
        ImageOf: "Kitchen",
        ShortDescription: "Kitchen with island",
      }),
      "Kitchen with island",
    );
  });

  it("falls back to ImageOf when that is all the MLS sent", () => {
    assert.equal(mediaRecordCaption({ ImageOf: "Living Room" }), "Living Room");
  });

  it("returns null when the media row has no text", () => {
    assert.equal(mediaRecordCaption({ MediaURL: "https://cdn.example/1.jpg" }), null);
  });
});

describe("listingPhotoCaptionsFromMedia", () => {
  it("keeps one slot per media row, including blanks", () => {
    assert.deepEqual(
      listingPhotoCaptionsFromMedia([
        { ImageOf: "Kitchen" },
        { MediaURL: "https://cdn.example/2.jpg" },
        { ShortDescription: "Family room" },
      ]),
      ["Kitchen", null, "Family room"],
    );
  });
});
