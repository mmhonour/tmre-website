"use client";

import { useState } from "react";

import {
  LATEST_FEED_SIZE_DEFAULT,
  LATEST_FEED_SIZE_MAX,
  LATEST_FEED_SIZE_MIN,
} from "@/lib/latest-feed-size-shared";
import {
  LATEST_FEED_RANKING,
  LATEST_STATUS_INPUTS,
  LATEST_STATUS_PRECEDENCE,
} from "@/lib/latest-status-rules";

/**
 * How many rows /latest renders.
 *
 * It sits with the badge rules because it is the last rule: eligibility decides
 * which listings *could* appear, and this decides how many actually do. A
 * listing that is current, eligible and simply ranked below the cut is
 * invisible in exactly the same way as one that failed to sync, which is a
 * distinction nobody could make from the page.
 */
function LatestFeedSizeControl({ initialSize }: { initialSize: number }) {
  const [size, setSize] = useState(initialSize);
  const [value, setValue] = useState(String(initialSize));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setMessage("Enter a number of rows");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/latest-feed-size", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ size: n }),
      });
      const body = (await res.json()) as { size?: number; error?: string };
      if (!res.ok || typeof body.size !== "number") {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setSize(body.size);
      setValue(String(body.size));
      setMessage(
        n !== body.size
          ? `Clamped to ${body.size} rows`
          : `Saved — /latest now renders ${body.size} rows`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
        Feed size — how many rows the page renders
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={LATEST_FEED_SIZE_MIN}
          max={LATEST_FEED_SIZE_MAX}
          step={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
          className="w-24 rounded-md border border-charcoal/15 bg-white px-2 py-1.5 font-mono text-sm text-navy tabular-nums disabled:opacity-50"
          aria-label="Latest feed size in rows"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || value.trim() === "" || String(size) === value.trim()}
          className="rounded-md border border-navy/20 bg-navy/5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-navy transition-colors hover:bg-navy/10 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <span className="font-mono text-[10px] text-charcoal/45">
          {LATEST_FEED_SIZE_MIN}–{LATEST_FEED_SIZE_MAX} · default{" "}
          {LATEST_FEED_SIZE_DEFAULT}
        </span>
      </div>
      {message ? (
        <p className="font-mono text-[10px] text-navy/70">{message}</p>
      ) : null}
      <p className="font-mono text-[10px] leading-relaxed text-charcoal/45">
        Eligible listings ranked below this cut cannot appear, however fresh
        they are — a busy Monday routinely produces more events than the
        default. Stored in sync_meta, no redeploy. Applies on the next page
        load; the warm feed cache is bypassed until it has been rebuilt at the
        new size. <span className="text-navy">npm run why:latest</span> reports
        a listing&apos;s rank against this number.
      </p>
    </div>
  );
}

/**
 * Latest display rules for badges + feed ranking. Data comes from
 * `lib/latest-status-rules.ts` — the same module the feed builder imports —
 * so this card cannot drift from production behavior.
 */
export default function AdminLatestStatusLogicPanel({
  initialFeedSize = LATEST_FEED_SIZE_DEFAULT,
}: {
  initialFeedSize?: number;
} = {}) {
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
          How /latest badges are assigned, and how many rows the page renders
        </p>
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          Source: <span className="text-navy">lib/latest-status-rules.ts</span>{" "}
          · applied by{" "}
          <span className="text-navy">lib/latest-listings.ts</span> +{" "}
          <span className="text-navy">lib/latest-town-coverage.ts</span>
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <LatestFeedSizeControl initialSize={initialFeedSize} />

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
