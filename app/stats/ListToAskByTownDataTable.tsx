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
  fetchListToAskRows,
  formatAskGap,
  formatVsAsk,
  type ListToAskRow,
} from "./list-to-ask-data";
import { statsListToAskTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import type { StatsKind } from "./stats-towns";

export default function ListToAskByTownDataTable({ kind }: { kind: StatsKind }) {
  const [loaded, setLoaded] = useState<{
    kind: StatsKind;
    rows: ListToAskRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchListToAskRows(kind).then((rows) => {
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
      title={statsListToAskTitle(kind)}
      subtitle={
        loading ? "Loading…" : `Closed ${noun} against their first asking price`
      }
      footer={
        <p className="font-mono text-[10px] text-charcoal/45">
          Total close prices ÷ total original asks, so larger {noun} carry the
          weight they should. Closings since 2024 that published both prices.
        </p>
      }
    >
      <StatsChartDataHead>
        <StatsChartDataRow>
          <StatsChartDataTh>Town</StatsChartDataTh>
          <StatsChartDataTh align="right">List to ask</StatsChartDataTh>
          <StatsChartDataTh align="right">Vs ask</StatsChartDataTh>
          <StatsChartDataTh align="right">Avg gap</StatsChartDataTh>
          <StatsChartDataTh align="right">Closings</StatsChartDataTh>
        </StatsChartDataRow>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {rows.length === 0 ? (
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={5} muted>
              {loading ? "Loading…" : "No closings with a published asking price yet."}
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
                {row.pct.toFixed(1)}%
              </StatsChartDataTd>
              <StatsChartDataTd align="right">
                {formatVsAsk(row.vsAsk)}
              </StatsChartDataTd>
              <StatsChartDataTd align="right">
                {formatAskGap(row.dollars)}
              </StatsChartDataTd>
              <StatsChartDataTd align="right" muted>
                {row.count.toLocaleString()}
              </StatsChartDataTd>
            </StatsChartDataRow>
          ))
        )}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
