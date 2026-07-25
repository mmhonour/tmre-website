"use client";

import { useEffect, useMemo, useState } from "react";
import { STATS_CLOSED_PERIOD_START } from "@/lib/stats-listing-rows";
import { statsByPriceTownTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";

type BucketRow = { id: string; label: string; count: number };

type ApiResponse = {
  year: number;
  towns: Partial<Record<Town, { buckets: BucketRow[] }>>;
};

const CURRENT_YEAR = new Date().getFullYear();

export default function PriceSalesByTownDataTable({ kind }: { kind: StatsKind }) {
  const [year] = useState(CURRENT_YEAR);
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sales-by-price/by-town?kind=${kind}&year=${year}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ApiResponse | null) => {
        if (cancelled) return;
        setPayload(data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, year]);

  const bands = useMemo(() => {
    for (const town of TOWN_LIST) {
      const buckets = payload?.towns?.[town]?.buckets;
      if (buckets?.length) return buckets;
    }
    return [] as BucketRow[];
  }, [payload]);

  return (
    <StatsChartDataTable
      title={statsByPriceTownTitle(kind)}
      subtitle={
        loading
          ? "Loading…"
          : `Closed sales by price band · tracking ${year} (available ${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR})`
      }
    >
      <StatsChartDataHead>
        <StatsChartDataRow>
          <StatsChartDataTh>Price band</StatsChartDataTh>
          {TOWN_LIST.map((town) => (
            <StatsChartDataTh key={town} align="right">
              <span style={{ color: STATS_TOWN_COLOR[town] }}>{town}</span>
            </StatsChartDataTh>
          ))}
        </StatsChartDataRow>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {bands.map((band) => (
          <StatsChartDataRow key={band.id}>
            <StatsChartDataTd>{band.label}</StatsChartDataTd>
            {TOWN_LIST.map((town) => {
              const count =
                payload?.towns?.[town]?.buckets?.find((b) => b.id === band.id)
                  ?.count ?? 0;
              return (
                <StatsChartDataTd key={town} align="right">
                  {count.toLocaleString()}
                </StatsChartDataTd>
              );
            })}
          </StatsChartDataRow>
        ))}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
