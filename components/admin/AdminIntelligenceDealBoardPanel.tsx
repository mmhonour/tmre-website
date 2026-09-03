import {
  BOARD_LISTING_LIMIT,
  BOARD_MIN_VISIBLE,
  BOARD_SCORE_TIER_FRACTION,
} from "@/lib/intelligence-deal-board-tiers";

const TIER_PCT = Math.round(BOARD_SCORE_TIER_FRACTION * 100);
const MIDDLE_PCT = 100 - TIER_PCT * 2;

/**
 * Read-only rules for the Intelligence deal-board middle tier.
 * Source of truth: `lib/intelligence-deal-board-tiers.ts` (+ gate in IntelligenceClient).
 */
export default function AdminIntelligenceDealBoardPanel() {
  return (
    <div id="admin-intel-deal-board" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Deal board · middle tier · read-only
          </p>
          <p className="mt-1 max-w-3xl text-sm text-charcoal/65">
            When the Intelligence board is sorted by Goldilocks score (high → low),
            each page can split into top / middle / bottom bands and collapse the
            middle behind a “Middle tier” control. This panel does not write
            anything — rules are code constants.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
              Reading from
            </p>
            <p className="mt-1 font-mono text-sm text-navy">
              lib/intelligence-deal-board-tiers.ts
            </p>
            <p className="mt-1 font-mono text-[12px] text-charcoal/55">
              components/IntelligenceClient.tsx · boardTiers
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
              When the middle tier appears
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-charcoal/70">
              <li>
                Sort column is{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  Score
                </span>{" "}
                and direction is{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  descending
                </span>{" "}
                (highest score first). Score ascending, or any other column
                (price, DOM, town, …), shows a flat list with no middle band.
              </li>
              <li>
                Vintage year-built filter is{" "}
                <span className="font-medium text-charcoal/80">off</span> (full
                range). Narrowing vintages disables tiers so the board stays one
                continuous list.
              </li>
              <li>
                The current board page has enough rows to form distinct top /
                middle / bottom slices (see split rules below). Very short pages
                stay flat.
              </li>
              <li>
                After applying the visibility floor, at least one middle row is
                hideable — otherwise the collapse control is omitted.
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
              How rows are split (per page)
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-charcoal/70">
              <li>
                Tiers apply to the{" "}
                <span className="font-medium text-charcoal/80">
                  current page only
                </span>{" "}
                (up to{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  {BOARD_LISTING_LIMIT}
                </span>{" "}
                listings), not the entire filtered result set.
              </li>
              <li>
                Top ≈{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  {TIER_PCT}%
                </span>
                , bottom ≈{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  {TIER_PCT}%
                </span>
                , middle ≈{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  {MIDDLE_PCT}%
                </span>{" "}
                by Goldilocks score (
                <span className="font-mono text-[12px]">
                  BOARD_SCORE_TIER_FRACTION
                </span>
                ). Each of top/bottom is at least 1 row when the page is
                non-empty.
              </li>
              <li>
                If top and bottom would overlap (too few rows),{" "}
                <span className="font-mono text-[12px]">canTier</span> is false
                and the page stays flat.
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
              Collapse / expand
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-charcoal/70">
              <li>
                Collapsed board always keeps at least{" "}
                <span className="font-mono text-[12px] text-charcoal/85">
                  {BOARD_MIN_VISIBLE}
                </span>{" "}
                rows visible (
                <span className="font-mono text-[12px]">BOARD_MIN_VISIBLE</span>
                ). Only middle rows beyond that floor can be hidden.
              </li>
              <li>
                Some middle rows may stay pinned above the toggle so the floor
                is met; the gold “Middle tier” control hides/shows the rest.
              </li>
              <li>
                Expanding shows the collapsible middle again; “Hide middle tier”
                collapses it. Changing town / filters resets the expanded state;
                changing sort alone does not force-collapse.
              </li>
            </ul>
          </div>

          <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="bg-cream/50 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Constant</th>
                  <th className="px-4 py-2.5 font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                <tr>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-navy">
                    BOARD_SCORE_TIER_FRACTION
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {BOARD_SCORE_TIER_FRACTION}
                  </td>
                  <td className="px-4 py-2.5 text-charcoal/65">
                    Top and bottom share of the page (~{TIER_PCT}% each)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-navy">
                    BOARD_MIN_VISIBLE
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {BOARD_MIN_VISIBLE}
                  </td>
                  <td className="px-4 py-2.5 text-charcoal/65">
                    Minimum rows left on screen when middle is collapsed
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-navy">
                    BOARD_LISTING_LIMIT
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {BOARD_LISTING_LIMIT}
                  </td>
                  <td className="px-4 py-2.5 text-charcoal/65">
                    Deal board page size (tiers computed per page)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-relaxed text-charcoal/55">
            Changing these rules requires a code change and deploy. Live scoring
            weights are separate under Admin → Data controls → Goldilocks.
          </p>
        </div>
      </div>
    </div>
  );
}
