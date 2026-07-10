"use client";

import Link from "next/link";
import { useState } from "react";
import PropertyTaxHistoryModal from "@/components/PropertyTaxHistoryModal";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingFrameClass, listingPanelClass } from "@/components/listing/listing-frame";
import { fmtAcres } from "@/lib/listing-comparables-shared";

export type ListingOverviewSchools = {
  elementary: string | null;
  middle: string | null;
  high: string | null;
  district: string | null;
};

export type ListingDetailsSchoolsPanelProps = {
  mlsId: string;
  propertyTitle: string;
  townHint?: string | null;
  statusLabel?: string | null;
  isClosed: boolean;
  isRental: boolean;
  soldPrice: number | null;
  closeDate: string | null;
  price: number | null;
  originalListPrice: number | null;
  reductionPct: number | null;
  dom: number | null;
  ppsf: number | null;
  lotAcres: number | null;
  annualPropertyTax: number | null;
  propertyTaxLabel: string;
  photoCount: number;
  photosHref?: string | null;
  schools: ListingOverviewSchools;
  fmtMoney: (n: number | null) => string;
  fmtDate: (value: string | null) => string | null;
};

export default function ListingDetailsSchoolsPanel({
  mlsId,
  propertyTitle,
  townHint = null,
  statusLabel = null,
  isClosed,
  isRental,
  soldPrice,
  closeDate,
  price,
  originalListPrice,
  reductionPct,
  dom,
  ppsf,
  lotAcres,
  annualPropertyTax,
  propertyTaxLabel,
  photoCount,
  photosHref = null,
  schools,
  fmtMoney,
  fmtDate,
  unframed = false,
}: ListingDetailsSchoolsPanelProps & { unframed?: boolean }) {
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const panelClass = unframed ? listingPanelClass : listingFrameClass;
  const hasSchools = Boolean(
    schools.elementary ||
      schools.middle ||
      schools.high ||
      schools.district,
  );

  return (
    <div className={`${panelClass} space-y-6`}>
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            Details
          </p>
          {statusLabel ? (
            <DealBoardStatusBadge status={statusLabel} size="sm" />
          ) : null}
        </div>
        <div className="space-y-4">
          {isClosed ? (
            <>
              <Stat
                label={isRental ? "Closed rent" : "Closed price"}
                value={fmtMoney(soldPrice ?? price)}
                large
              />
              {closeDate && (
                <Stat
                  label="Closed date"
                  value={fmtDate(closeDate) ?? closeDate}
                />
              )}
              {price != null && soldPrice !== price && (
                <Stat label="Last list price" value={fmtMoney(price)} />
              )}
            </>
          ) : (
            <>
              <Stat
                label={isRental ? "Monthly rent" : "List price"}
                value={fmtMoney(price)}
                large
              />
              {originalListPrice && originalListPrice !== price && (
                <Stat
                  label="Originally"
                  value={fmtMoney(originalListPrice)}
                  sub={reductionPct ? `−${reductionPct}%` : undefined}
                  accent={reductionPct ? "coral" : undefined}
                />
              )}
            </>
          )}
          {!isClosed && dom != null ? (
            <Stat label="Days on market" value={`${dom}d`} />
          ) : null}
          {!isRental && (
            <Stat label="$ / sqft" value={ppsf ? `$${ppsf}` : "—"} />
          )}
          {lotAcres != null && lotAcres > 0 ? (
            <Stat label="Lot size" value={fmtAcres(lotAcres)} />
          ) : null}
          {!isRental && annualPropertyTax != null && (
            <Stat
              label={propertyTaxLabel}
              value={fmtMoney(annualPropertyTax)}
              labelButton
              onLabelClick={() => setTaxModalOpen(true)}
            />
          )}
          <Stat
            label="Photos"
            value={photoCount > 0 ? String(photoCount) : "—"}
            labelHref={photosHref}
          />
        </div>
      </div>

      {hasSchools ? (
        <div className="border-t border-white/10 pt-6">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            Schools
          </p>
          <ul className="space-y-2 text-sm">
            {schools.elementary && (
              <SchoolRow label="Elementary" value={schools.elementary} />
            )}
            {schools.middle && (
              <SchoolRow label="Middle" value={schools.middle} />
            )}
            {schools.high && (
              <SchoolRow label="High" value={schools.high} />
            )}
            {schools.district && (
              <SchoolRow label="District" value={schools.district} />
            )}
          </ul>
        </div>
      ) : null}

      <PropertyTaxHistoryModal
        open={taxModalOpen}
        onClose={() => setTaxModalOpen(false)}
        mlsId={mlsId}
        title={propertyTitle}
        subtitle={townHint}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  large,
  labelButton,
  onLabelClick,
  labelHref,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "coral" | "sage";
  large?: boolean;
  labelButton?: boolean;
  onLabelClick?: () => void;
  labelHref?: string | null;
}) {
  const color =
    accent === "coral" ? "text-coral" : accent === "sage" ? "text-sage" : "text-white";
  const labelClass =
    "font-mono text-[10px] tracking-[0.2em] uppercase text-white/55";
  const labelLinkClass = `${labelClass} hover:text-gold transition-colors underline decoration-white/25 underline-offset-2`;
  return (
    <div className="flex items-baseline justify-between gap-4">
      {labelHref ? (
        <Link href={labelHref} className={labelLinkClass}>
          {label}
        </Link>
      ) : labelButton && onLabelClick ? (
        <button
          type="button"
          onClick={onLabelClick}
          className={`${labelClass} text-left hover:text-gold transition-colors underline decoration-white/25 underline-offset-2`}
        >
          {label}
        </button>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      <span
        className={`font-mono tabular-nums ${
          large ? "text-2xl" : "text-base"
        } ${color}`}
      >
        {value}
        {sub && <span className="ml-2 text-xs text-white/55">{sub}</span>}
      </span>
    </div>
  );
}

function SchoolRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/50 shrink-0">
        {label}
      </span>
      <span className="text-white/85 text-right">{value}</span>
    </li>
  );
}
