"use client";

import FindParcelMap from "@/components/FindParcelMap";
import type { FindParcelMapPayload } from "@/lib/find-parcel-map-shared";

const FIXTURE: FindParcelMapPayload = {
  street: "12 Main St",
  subjectKey: "subject",
  radiusMiles: 0.35,
  boundZips: ["06880"],
  highlightZip: "06880",
  criteria: {
    zip: "06880",
    beds: 4,
    baths: 3,
    lotAcres: null,
    sqft: 2800,
    vintageBucket: "1941-1970",
    vintageLabel: "1941–1970",
  },
  missingCriteria: [],
  subject: {
    key: "subject",
    address: "12 Main St",
    city: "Westport",
    price: 2_150_000,
    score: 0,
    isRental: false,
    beds: 4,
    baths: 3,
    sqft: 2800,
    latitude: 41.141,
    longitude: -73.358,
    photoCount: 0,
  },
  neighbors: [
    {
      relation: "same_street",
      miles: 0.08,
      zip: "06880",
      vintageLabel: "1941–1970",
      yearBuilt: 1965,
      furnished: null,
      href: "/listings/preview-same",
      pin: {
        key: "same",
        address: "18 Main St",
        city: "Westport",
        price: 1_875_000,
        score: 0,
        isRental: false,
        beds: 4,
        baths: 2.5,
        sqft: 2600,
        latitude: 41.142,
        longitude: -73.357,
        photoCount: 0,
      },
    },
    {
      relation: "cross_street",
      miles: 0.18,
      zip: "06880",
      vintageLabel: "1991–2010",
      yearBuilt: 2001,
      furnished: null,
      href: "/listings/preview-cross",
      pin: {
        key: "cross",
        address: "4 Compo Rd",
        city: "Westport",
        price: 3_200_000,
        score: 0,
        isRental: false,
        beds: 5,
        baths: 4,
        sqft: 4100,
        latitude: 41.139,
        longitude: -73.36,
        photoCount: 0,
      },
    },
    {
      relation: "same_street",
      miles: 0.22,
      zip: "06880",
      vintageLabel: "1941–1970",
      yearBuilt: 1968,
      furnished: null,
      href: "/listings/preview-like",
      pin: {
        key: "like",
        address: "40 Main St",
        city: "Westport",
        price: 2_400_000,
        score: 0,
        isRental: false,
        beds: 4,
        baths: 3,
        sqft: 2900,
        latitude: 41.143,
        longitude: -73.356,
        photoCount: 0,
      },
    },
  ],
};

export default function FindParcelMapPreview() {
  return (
    <div className="min-h-screen bg-navy-dark">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-white">
          VGSI neighborhood map
        </h1>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-white/65">
          Around chips sit on the upper-right of the map. Same street zooms
          the street; Cross streets pulls back to crossings; 0.35 mi frames
          the radius. Reset and first paint fill the panel with the town
          outline. Streets without parking / cemetery icons. Assessor lot
          lines are not in VGSI. Like kind uses the criteria panel. Fixture
          pins — not a live parcel. Production: /find/westport/{"{pid}"}.
        </p>
        <FindParcelMap visionPid="preview" initial={FIXTURE} />
      </div>
    </div>
  );
}
