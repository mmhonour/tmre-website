import {
  COMPARABLES_VINTAGE_EDGE_FRACTION,
  VINTAGE_BUCKET_RANGES,
  VINTAGE_BUCKETS,
} from "@/lib/vintage-buckets";

/**
 * Read-only view of the year-built vintage buckets. Definitions live in code
 * (`lib/vintage-buckets.ts`) — not editable from Admin.
 */
export default function AdminVintagesPanel() {
  const edgePct = Math.round(COMPARABLES_VINTAGE_EDGE_FRACTION * 100);

  return (
    <div id="admin-vintages" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Vintages · read-only
          </p>
          <p className="mt-1 max-w-3xl text-sm text-charcoal/65">
            Year-built buckets used by Intelligence filters, Stats / sales-by-vintage
            charts, Deal of the Day medians, and comparable matching. This panel
            does not write anything — buckets are code constants.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
              Reading from
            </p>
            <p className="mt-1 font-mono text-sm text-navy">
              lib/vintage-buckets.ts
            </p>
            <ul className="mt-2 space-y-1 text-sm text-charcoal/65">
              <li>
                <span className="font-mono text-[12px] text-charcoal/80">
                  VINTAGE_BUCKETS
                </span>{" "}
                — display labels and order
              </li>
              <li>
                <span className="font-mono text-[12px] text-charcoal/80">
                  classifyYearBuilt()
                </span>{" "}
                — maps listing <span className="font-mono text-[12px]">YearBuilt</span>{" "}
                → bucket id
              </li>
              <li>
                <span className="font-mono text-[12px] text-charcoal/80">
                  VINTAGE_BUCKET_RANGES
                </span>{" "}
                — inclusive year spans for edge matching
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-charcoal/55">
              Changing bucket boundaries requires a code change and deploy. The
              comparable edge fraction default is {edgePct}% of a bucket span;
              Admin → Data controls → Pricing can override the live edge % in{" "}
              <span className="font-mono">sync_meta</span> without editing this
              file.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-cream/50 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Label</th>
                  <th className="px-4 py-2.5 font-medium">Id</th>
                  <th className="px-4 py-2.5 font-medium">Year range</th>
                  <th className="px-4 py-2.5 font-medium">classifyYearBuilt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                {VINTAGE_BUCKETS.map((bucket, index) => {
                  const range =
                    bucket.id === "unknown"
                      ? null
                      : VINTAGE_BUCKET_RANGES[bucket.id];
                  const rule =
                    bucket.id === "pre-1900"
                      ? "year < 1900"
                      : bucket.id === "1900-1940"
                        ? "1900–1940"
                        : bucket.id === "1941-1970"
                          ? "1941–1970"
                          : bucket.id === "1970-1990"
                            ? "1971–1990"
                            : bucket.id === "1991-2010"
                              ? "1991–2009"
                              : bucket.id === "2010-2020"
                                ? "2010–2019"
                                : "≥ 2020";
                  return (
                    <tr key={bucket.id} className="bg-white">
                      <td className="px-4 py-2.5 font-mono text-charcoal/40 tabular-nums">
                        {index}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-navy">
                        {bucket.label}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-charcoal/70">
                        {bucket.id}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] tabular-nums text-charcoal/70">
                        {range ? `${range.lo}–${range.hi}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-charcoal/55">
                        {rule}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-cream/20">
                  <td className="px-4 py-2.5 font-mono text-charcoal/40">—</td>
                  <td className="px-4 py-2.5 font-medium text-charcoal/70">
                    Unknown
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-charcoal/70">
                    unknown
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-charcoal/55">
                    —
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-charcoal/55">
                    null / &lt;1600 / far future
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-relaxed text-charcoal/50">
            Consumers include{" "}
            <span className="font-mono">lib/intelligence-vintage-filter.ts</span>,{" "}
            <span className="font-mono">lib/intelligence-vintage-stats.ts</span>,{" "}
            Stats sales-by-vintage APIs, and pricing comparable matchers that call{" "}
            <span className="font-mono">vintageMatchesForComparable()</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
