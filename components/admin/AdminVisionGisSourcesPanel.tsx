import { VISION_GIS_TOWNS } from "@/lib/vision-gis-towns";

/** Stored VGSI GIS homepages — same source as the crawler (`lib/vision-gis-towns.ts`). */
export default function AdminVisionGisSourcesPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal/70 leading-relaxed">
        Town GIS homepage (Streets.aspx / search). Find → Field Card uses the
        VGSI PDF on images.vgsi.com. Find → VGSI Parcel is Parcel.aspx.
      </p>
      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 mb-2">
          VGSI GIS on the internet
        </p>
        <ul className="space-y-2 text-sm text-charcoal/70 leading-relaxed">
          {VISION_GIS_TOWNS.map((town) => (
            <li key={town.hostSlug}>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/40">
                {town.town} homepage
              </span>
              <br />
              <a
                href={town.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-navy break-all hover:underline"
              >
                {town.baseUrl}
              </a>
              <br />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/40">
                Field Card PDF
              </span>
              <br />
              <span className="font-mono text-[11px] text-navy break-all">
                {town.fieldCardPdfBase}/{"{visionPid}"}.pdf
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
