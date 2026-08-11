"use client";

import {
  LATEST_FEED_RANKING,
  LATEST_STATUS_INPUTS,
  LATEST_STATUS_PRECEDENCE,
} from "@/lib/latest-status-rules";

/**
 * Latest display rules for badges + feed ranking. Data comes from
 * `lib/latest-status-rules.ts` — the same module the feed builder imports —
 * so this card cannot drift from production behavior.
 */
export default function AdminLatestStatusLogicPanel() {
  return (
    <div
      id="admin-latest-status-logic"
      className="scroll-mt-24 rounded-xl border border-charcoal/[0.08] bg-cream/20 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
          Latest display rules
        </p>
        <p className="mt-1 text-sm text-navy font-medium">
          How /latest badges are assigned and which rows win the 30 slots
        </p>
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          Source: <span className="text-navy">lib/latest-status-rules.ts</span>{" "}
          · applied by{" "}
          <span className="text-navy">lib/latest-listings.ts</span> +{" "}
          <span className="text-navy">lib/latest-town-coverage.ts</span>
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Badge precedence — first match wins
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-charcoal/45">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-3 font-medium">Badge</th>
                  <th className="py-1.5 pr-3 font-medium">Event?</th>
                  <th className="py-1.5 font-medium">Rule</th>
                </tr>
              </thead>
              <tbody>
                {LATEST_STATUS_PRECEDENCE.map((row) => (
                  <tr
                    key={row.status}
                    className="border-t border-charcoal/[0.06] align-top"
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-charcoal/40">
                      {row.order}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy">
                        {row.badge}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      {row.event ? (
                        <span className="text-sage">Yes — priority slot</span>
                      ) : (
                        <span className="text-charcoal/40">No</span>
                      )}
                    </td>
                    <td className="py-2 text-slate leading-snug">{row.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Feed ranking — after badges are assigned
          </p>
          <ol className="space-y-2">
            {LATEST_FEED_RANKING.map((step) => (
              <li key={step.order} className="flex gap-3 text-sm">
                <span className="font-mono text-[11px] text-charcoal/40 shrink-0 pt-0.5">
                  {step.order}.
                </span>
                <span>
                  <span className="text-navy font-medium">{step.label}</span>
                  <span className="text-slate"> — {step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Inputs the badge engine reads
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-charcoal/45">
                  <th className="py-1.5 pr-3 font-medium">Field</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 font-medium">Used for</th>
                </tr>
              </thead>
              <tbody>
                {LATEST_STATUS_INPUTS.map((row) => (
                  <tr
                    key={row.field}
                    className="border-t border-charcoal/[0.06] align-top"
                  >
                    <td className="py-2 pr-3 font-mono text-[11px] text-navy whitespace-nowrap">
                      {row.field}
                    </td>
                    <td className="py-2 pr-3 text-slate text-xs leading-snug">
                      {row.source}
                    </td>
                    <td className="py-2 text-slate text-xs leading-snug">
                      {row.usedFor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
