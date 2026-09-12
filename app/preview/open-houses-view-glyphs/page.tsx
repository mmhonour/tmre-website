import OpenHousesClient from "@/app/open-houses/OpenHousesClient";
import {
  OPEN_HOUSES_VIEW_GLYPHS_FIXTURE,
  OPEN_HOUSES_VIEW_GLYPHS_OPEN_TOWNS,
} from "./OpenHousesViewGlyphsPreview";

export const metadata = {
  title: "Preview — Open houses Large / Grid / Line — TMRE",
  robots: { index: false, follow: false },
};

export default function OpenHousesViewGlyphsPreviewPage() {
  return (
    <OpenHousesClient
      initial={OPEN_HOUSES_VIEW_GLYPHS_FIXTURE}
      defaultOpenTowns={OPEN_HOUSES_VIEW_GLYPHS_OPEN_TOWNS}
      previewBanner="UI preview — full Open Houses page. Click Large, Grid, or Line. Fixture homes, not the live week."
    />
  );
}
