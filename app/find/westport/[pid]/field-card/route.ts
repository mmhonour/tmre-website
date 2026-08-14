import { notFound } from "next/navigation";
import { westportParcelHref } from "@/lib/listing-url";
import { renderTmreFieldCardHtml } from "@/lib/vision-field-card-html";
import { mergeWestportProperty } from "@/lib/westport-lookup";

export const dynamic = "force-dynamic";

/** Printable TMRE Field Card from catalogued JSON — not the live VGSI page or PDF. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pid: string }> },
) {
  const { pid } = await params;
  const visionPid = pid.trim();
  if (!visionPid) notFound();

  const property = await mergeWestportProperty(visionPid);
  if (!property) notFound();

  const html = renderTmreFieldCardHtml({
    town: property.town,
    visionPid: property.visionPid,
    street: property.street,
    addressFull: property.addressFull,
    mblu: property.mblu,
    fields: property.fieldCard.fields,
    parcelHref: westportParcelHref(property.visionPid),
    parcelUrl: property.fieldCard.parcelUrl ?? property.parcelUrl,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
