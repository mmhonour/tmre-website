"use client";

import { useMemo, useState } from "react";
import { ListingVisionAddressLink } from "@/components/listing/ListingVisionAddressLink";
import {
  listingVisionAddressHref,
  type ListingVisionLink,
  type ListingVisionParcel,
} from "@/lib/listing-vision-link-shared";

const STREET = "16 Sea Spray Rd";

function parcel(pid: string): ListingVisionParcel {
  return {
    visionPid: pid,
    parcelHref: `/find/westport/${pid}`,
    fieldCardHref: null,
    vgsiHref: `https://gis.vgsi.com/westportct/Parcel.aspx?pid=${pid}`,
    addressFull: STREET,
    mblu: null,
    useCode: null,
    ownerName: null,
    assessedValue: null,
    lastSalePrice: null,
    lastSaleDate: null,
    linkedMlsId: null,
  };
}

const SCENES = [
  {
    id: "locked",
    label: "Locked visitor",
    unlocked: false,
    vision: {
      town: "Westport",
      stamped: true,
      parcel: parcel("3564"),
      candidates: [],
      danglingPid: null,
    } satisfies ListingVisionLink,
  },
  {
    id: "mapped",
    label: "Admin · stamped PID",
    unlocked: true,
    vision: {
      town: "Westport",
      stamped: true,
      parcel: parcel("3564"),
      candidates: [],
      danglingPid: null,
    } satisfies ListingVisionLink,
  },
  {
    id: "search",
    label: "Admin · no match",
    unlocked: true,
    vision: null,
  },
] as const;

export function ListingVisionAddressPreview() {
  const [sceneId, setSceneId] = useState<(typeof SCENES)[number]["id"]>("mapped");
  const scene = SCENES.find((row) => row.id === sceneId) ?? SCENES[1];
  const href = useMemo(() => {
    if (!scene.unlocked) return null;
    return listingVisionAddressHref(scene.vision, STREET);
  }, [scene]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {SCENES.map((row) => (
          <button
            key={row.id}
            type="button"
            aria-pressed={sceneId === row.id}
            onClick={() => setSceneId(row.id)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
              sceneId === row.id
                ? "border-gold/50 bg-gold/10 text-navy"
                : "border-charcoal/[0.08] bg-white text-navy"
            }`}
          >
            {row.label}
          </button>
        ))}
      </div>

      <div className="navy-gradient rounded-2xl px-6 py-8 text-white">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          {scene.unlocked ? "Admin unlocked" : "Public / locked"}
        </p>
        <h2 className="mt-2 font-serif text-3xl leading-tight">
          {href ? (
            <ListingVisionAddressLink href={href}>{STREET}</ListingVisionAddressLink>
          ) : (
            STREET
          )}
        </h2>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">
          {href ? `Click → ${href}` : "No link — address is plain text"}
        </p>
      </div>
    </div>
  );
}
