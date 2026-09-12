import OpenHousesClient from "@/app/open-houses/OpenHousesClient";
import {
  OPEN_HOUSES_VIEW_GLYPHS_FIXTURE,
  OPEN_HOUSES_VIEW_GLYPHS_OPEN_TOWNS,
  parseOpenHousesPreviewView,
} from "./OpenHousesViewGlyphsPreview";

export const metadata = {
  title: "Preview — Open houses Large / Grid / Line — TMRE",
  robots: { index: false, follow: false },
};

export default async function OpenHousesViewGlyphsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  return (
    <OpenHousesClient
      initial={OPEN_HOUSES_VIEW_GLYPHS_FIXTURE}
      defaultOpenTowns={OPEN_HOUSES_VIEW_GLYPHS_OPEN_TOWNS}
      isolatePrefs
      initialView={parseOpenHousesPreviewView(view)}
      previewBanner="UI preview — full website page (nav, hero, towns, footer). Click Large, Grid, or Line."
    />
  );
}
