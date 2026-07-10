"use client";

import { useEffect, useState } from "react";
import type { StatsCity, StatsKind } from "./stats-towns";
import { statsByVintageTitle, statsClosedLabel, statsVolumeNoun } from "./stats-labels";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";

type BucketRow = {
  id: string;
  label: string;
  count: number;
  share: number;
};

type ApiResponse = {
  city: string;
  period: string;
  totalSales: number;
  knownYearBuilt: number;
  unknownYearBuilt: number;
  buckets: BucketRow[];
  topBucket: BucketRow | null;
  fallback?: boolean;
};

export default function VintageSalesDataTable({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const volumeNoun = statsVolumeNoun(kind);
  const topId = payload?.topBucket?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const url =
      city === "All"
        ? `/api/sales-by-vintage?city=All&kind=${kind}`
        : `/api/sales-by-vintage?city=${encodeURIComponent(city)}&kind=${kind}`;

    fetch(url, { cache: "no-store" })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (cancelled) return;
        setPayload(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  const scopeLabel = city === "All" ? "All Towns" : `${city}, CT`;

  if (loading) {
    return (
      <StatsChartDataTable
        title={`${statsByVintageTitle(kind)} — data`}
        subtitle={scopeLabel}
      >
        <StatsChartDataBody>
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={3} muted>
              Loading…
            </StatsChartDataTd>
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  const buckets = payload?.buckets ?? [];

  return (
    <StatsChartDataTable
      title={`${statsByVintageTitle(kind)} — data`}
      subtitle={
        payload?.period
          ? `${scopeLabel} · ${payload.period} ${statsClosedLabel(kind)}`
          : scopeLabel
      }
      footer={
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[9px] tracking-wide text-charcoal/50">
          <span>
            Total: {payload?.totalSales?.toLocaleString() ?? "—"} {volumeNoun}
          </span>
          {payload && payload.unknownYearBuilt > 0 ? (
            <span>{payload.unknownYearBuilt.toLocaleString()} missing year built</span>
          ) : null}
          {payload?.topBucket ? (
            <span>
              Top era: {payload.topBucket.label} ({payload.topBucket.count.toLocaleString()})
            </span>
          ) : null}
        </div>
      }
    >
      <StatsChartDataHead>
        <tr>
          <StatsChartDataTh>Year built era</StatsChartDataTh>
          <StatsChartDataTh align="right">Count</StatsChartDataTh>
          <StatsChartDataTh align="right">Share</StatsChartDataTh>
        </tr>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {buckets.length === 0 ? (
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={3} muted>
              No vintage data
            </StatsChartDataTd>
          </StatsChartDataRow>
        ) : (
          buckets.map((bucket, i) => {
            const pct =
              payload && payload.knownYearBuilt > 0
                ? Math.round(bucket.share * 100)
                : null;
            const isTop = bucket.id === topId;
            return (
              <StatsChartDataRow key={bucket.id} stripe={i % 2 === 1}>
                <StatsChartDataTd bold={isTop}>
                  {bucket.label}
                  {isTop ? " · top" : ""}
                </StatsChartDataTd>
                <StatsChartDataTd align="right" bold={isTop}>
                  {bucket.count.toLocaleString()}
                </StatsChartDataTd>
                <StatsChartDataTd align="right" muted={pct == null}>
                  {pct != null ? `${pct}%` : "—"}
                </StatsChartDataTd>
              </StatsChartDataRow>
            );
          })
        )}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
