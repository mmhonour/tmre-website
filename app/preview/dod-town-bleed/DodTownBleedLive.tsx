import { Suspense } from "react";
import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import {
  loadDodTownBleedPreviewSeed,
  type DodTownBleedPreviewSeed,
} from "@/app/preview/dod-town-bleed/preview-seed";

/** Full Deal of the Day page for PR previews — locked seed, no live carousel fetch. */
export async function DodTownBleedLive({
  forcePhoneLayout = false,
  seed: seedProp,
}: {
  forcePhoneLayout?: boolean;
  seed?: DodTownBleedPreviewSeed;
}) {
  const seed = seedProp ?? (await loadDodTownBleedPreviewSeed());

  return (
    <Suspense fallback={null}>
      <DealOfTheWeekHero
        mode="day"
        lockSeed
        forcePhoneLayout={forcePhoneLayout}
        initialDealsByTown={seed.dealsByTown}
        initialKind={seed.kind}
        initialPropertyClass={seed.propertyClass}
      />
    </Suspense>
  );
}
