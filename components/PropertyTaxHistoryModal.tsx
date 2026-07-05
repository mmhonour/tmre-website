"use client";

import { useEffect, useState } from "react";
import ModalPortal from "@/components/ModalPortal";
import { fmtMoney } from "@/lib/listing-history";

type TaxYearEntry = {
  taxYearEnd: number;
  taxYearLabel: string;
  amount: number | null;
};

type PropertyTaxResponse = {
  years: TaxYearEntry[];
  parcelNumber: string | null;
};

export default function PropertyTaxHistoryModal({
  open,
  onClose,
  mlsId,
  title,
  subtitle = null,
}: {
  open: boolean;
  onClose: () => void;
  mlsId: string;
  title: string;
  subtitle?: string | null;
}) {
  const [data, setData] = useState<PropertyTaxResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(`/api/listings/${encodeURIComponent(mlsId)}/property-taxes`, {
      cache: "default",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: PropertyTaxResponse | null) => {
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mlsId]);

  const years = data?.years ?? [];

  return (
    <ModalPortal open={open} onClose={onClose} ariaLabel="Property tax history">
      <div
        className="relative bg-white rounded-3xl shadow-2xl shadow-navy/20 max-w-md w-full p-8 max-h-[min(85vh,calc(100vh-6rem))] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
              Real estate taxes
              {subtitle ? ` · ${subtitle}` : ""}
            </p>
            <h2 className="font-serif text-2xl text-navy">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="font-mono text-xs text-slate/70">Loading tax history…</p>
        ) : years.length === 0 ? (
          <p className="font-mono text-xs text-slate/70">
            No property tax history cached yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/[0.08]">
                  <th className="pb-3 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-slate/70 font-normal">
                    Fiscal year
                  </th>
                  <th className="pb-3 text-right font-mono text-[10px] tracking-[0.15em] uppercase text-slate/70 font-normal">
                    Annual tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {years.map((row) => (
                  <tr
                    key={row.taxYearEnd}
                    className="border-b border-charcoal/[0.05] last:border-0"
                  >
                    <td className="py-3 pr-4 text-navy/90">{row.taxYearLabel}</td>
                    <td className="py-3 text-right font-mono tabular-nums text-navy">
                      {row.amount != null ? fmtMoney(row.amount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data?.parcelNumber ? (
          <p className="mt-6 pt-4 border-t border-charcoal/[0.06] font-mono text-[10px] tracking-[0.1em] uppercase text-slate/60">
            Parcel {data.parcelNumber}
          </p>
        ) : null}
      </div>
    </ModalPortal>
  );
}
