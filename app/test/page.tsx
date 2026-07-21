import type { Metadata } from "next";
import ListingSplitTestClient from "./ListingSplitTestClient";

export const metadata: Metadata = {
  title: "_test · Listing split panel",
  description:
    "Prototype vertical split for Spotlight / property listing pages — not production.",
  robots: { index: false, follow: false },
};

/**
 * Sandbox for the listing vertical-split layout.
 * Route is `/test` (Next.js treats `_test` folders as private / non-routable).
 * Promote into Spotlight + listing pages only after sign-off.
 */
export default function ListingSplitTestPage() {
  return <ListingSplitTestClient />;
}
