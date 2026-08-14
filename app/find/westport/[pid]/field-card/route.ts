import { notFound } from "next/navigation";
import { getVisionFieldCardHtml } from "@/lib/r2-vision-store";
import { prepareVisionFieldCardSrcDoc } from "@/lib/vision-field-card-html";
import { visionGisTownConfig } from "@/lib/vision-gis-towns";
import { WESTPORT_LOOKUP_TOWN } from "@/lib/westport-lookup";

export const dynamic = "force-dynamic";

/** Full Field Card HTML in its own tab — not embedded on the parcel page. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pid: string }> },
) {
  const { pid } = await params;
  const visionPid = pid.trim();
  if (!visionPid) notFound();

  const gis = visionGisTownConfig(WESTPORT_LOOKUP_TOWN);
  const raw = await getVisionFieldCardHtml(WESTPORT_LOOKUP_TOWN, visionPid);
  if (!raw || !gis) notFound();

  return new Response(prepareVisionFieldCardSrcDoc(raw, gis.baseUrl), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
