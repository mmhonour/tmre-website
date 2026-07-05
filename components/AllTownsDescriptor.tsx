"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAllTownsDescriptorRequest,
  normalizeAllTownsDescriptor,
  synthesizeAllTownsDescriptorFallback,
  type AllTownsDescriptorRequest,
  type TownDescriptorStats,
} from "@/lib/intelligence-all-towns-descriptor";

type FilterContext = AllTownsDescriptorRequest["filterContext"];

function monthsSupplyColorClass(monthsSupply: number | null): string {
  if (monthsSupply == null) return "text-white/40";
  if (monthsSupply <= 2) return "text-coral";
  if (monthsSupply <= 4) return "text-gold";
  return "text-sage";
}

export default function AllTownsDescriptor({
  towns,
  aggregateMonthsSupply,
  monthlySalesLoaded,
  filterContext,
  bedLabel,
  bathLabel,
  vintageLabel,
  priceLabel,
}: {
  towns: TownDescriptorStats[];
  aggregateMonthsSupply: number | null;
  monthlySalesLoaded: boolean;
  filterContext: FilterContext;
  bedLabel?: React.ReactNode;
  bathLabel?: React.ReactNode;
  vintageLabel?: React.ReactNode;
  priceLabel?: React.ReactNode;
}) {
  const payload = useMemo(
    () =>
      buildAllTownsDescriptorRequest(
        towns,
        aggregateMonthsSupply,
        filterContext,
      ),
    [towns, aggregateMonthsSupply, filterContext],
  );

  const fallback = useMemo(
    () => synthesizeAllTownsDescriptorFallback(payload),
    [payload],
  );

  const [descriptor, setDescriptor] = useState(fallback);
  const [source, setSource] = useState<"ai" | "computed">("computed");
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setDescriptor(fallback);
    setSource("computed");

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch("/api/intelligence/all-towns-descriptor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data: { descriptor?: string; source?: "ai" | "computed" } | null,
          ) => {
            if (requestId !== requestIdRef.current || !data?.descriptor?.trim()) {
              return;
            }
            const normalized =
              normalizeAllTownsDescriptor(data.descriptor) ?? fallback;
            setDescriptor(normalized);
            setSource(
              data.source === "ai" && normalized !== fallback ? "ai" : "computed",
            );
          },
        )
        .catch(() => {
          /* keep computed fallback */
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [payload, fallback]);

  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 font-mono text-xs tracking-wide">
      <span
        className={`text-white/45 ${loading ? "animate-pulse" : ""}`}
      >
        {descriptor}
      </span>
      {source === "ai" ? (
        <>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          <span className="text-white/30 text-[10px] tracking-[0.15em] uppercase">
            AI read
          </span>
        </>
      ) : null}
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <span
        className={monthsSupplyColorClass(aggregateMonthsSupply)}
        aria-label={
          !monthlySalesLoaded
            ? "Months supply loading"
            : aggregateMonthsSupply != null
              ? `${aggregateMonthsSupply.toFixed(1)} months supply blended`
              : "Months supply unavailable"
        }
      >
        Months supply{" "}
        <span className="tabular-nums font-medium">
          {!monthlySalesLoaded
            ? "…"
            : aggregateMonthsSupply != null
              ? aggregateMonthsSupply.toFixed(1)
              : "—"}
        </span>
      </span>
      {priceLabel ? (
        <>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          {priceLabel}
        </>
      ) : null}
      {bedLabel ? (
        <>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          {bedLabel}
        </>
      ) : null}
      {bathLabel ? (
        <>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          {bathLabel}
        </>
      ) : null}
      {vintageLabel ? (
        <>
          <span className="text-white/25" aria-hidden>
            ·
          </span>
          {vintageLabel}
        </>
      ) : null}
    </p>
  );
}
