"use client";

import { useEffect, useState } from "react";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";
import {
  fetchPriceSpreadRows,
  formatSpreadMoney,
  formatSpreadPct,
  type PriceSpreadRow,
} from "./price-spread-data";
import { statsPriceSpreadTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import type { StatsKind } from "./stats-towns";

export default function PriceSpreadByTownDataTable({
  kind,
}: {
  kind: StatsKind;
}) {
  const [loaded, setLoaded] = useState<{
    kind: StatsKind;
    rows: PriceSpreadRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPriceSpreadRows(kind).then((rows) => {
      if (!cancelled) setLoaded({ kind, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const loading = loaded?.kind !== kind;
  const rows = loading ? [] : (loaded?.rows ?? []);
  const noun = kind === "rental" ? "leases" : "sales";

  return (
    <StatsChartDataTable
      title={statsPriceSpreadTitle(kind)}
      subtitle={
        loading ? "Loading…" : `Closed ${noun} · median, average and the gap`
      }
      footer={
        <p className="font-mono text-[10px] text-charcoal/45">
          Delta is average minus median on the same pool of {noun}. A few
          high-end {noun} pull the average above the typical one, so the gap
          says how top-heavy a town&apos;s market is.
        </p>
      }
    >
      <StatsChartDataHead>
        <StatsChartDataRow>
          <StatsChartDataTh>Town</StatsChartDataTh>
          <StatsChartDataTh align="right">Median</StatsChartDataTh>
          <StatsChartDataTh align="right">Average</StatsChartDataTh>
          <StatsChartDataTh align="right">Delta</StatsChartDataTh>
          <StatsChartDataTh align="right">Vs median</StatsChartDataTh>
        </StatsChartDataRow>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {rows.length === 0 ? (
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={5} muted>
              {loading ? "Loading…" : "No closed prices for these towns yet."}
            </StatsChartDataTd>
          </StatsChartDataRow>
        ) : (
          rows.map((row) => (
            <StatsChartDataRow key={row.town}>
              <StatsChartDataTd>
                <span style={{ color: STATS_TOWN_COLOR[row.town] }}>
                  {row.town}
                </span>
              </StatsChartDataTd>
              <StatsChartDataTd align="right" bold>
                {formatSpreadMoney(row.medianPrice)}
              </StatsChartDataTd>
              <StatsChartDataTd align="right">
                {formatSpreadMoney(row.averagePrice)}
              </StatsChartDataTd>
              <StatsChartDataTd align="right">
                {formatSpreadMoney(row.priceDelta)}
              </StatsChartDataTd>
              <StatsChartDataTd align="right" muted>
                {formatSpreadPct(row.priceDeltaPct)}
              </StatsChartDataTd>
            </StatsChartDataRow>
          ))
        )}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
