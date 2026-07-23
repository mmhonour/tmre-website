"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import PropertyTaxHistoryModal from "@/components/PropertyTaxHistoryModal";
import {
  listingFrameCompactClass,
  listingPanelCompactClass,
} from "@/components/listing/listing-frame";
import { fmtAcres } from "@/lib/listing-comparables-shared";
import { closedVsLastListPct } from "@/lib/listing-history";
import { formatInsightMedianPpsf } from "@/lib/insight-median-ppsf";
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";

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
  /** City peer median $/sqft from Goldilocks scoring (sale or rent). */
  cityMedianPpsf?: number | null;
  /** Listing $/sqft used for median comparison (includes rentals). */
  listingPricePerSqft?: number | null;
  medianPpsfBand?: "below" | "at" | "above" | null;
  schools: ListingOverviewSchools;
  fmtMoney: (n: number | null) => string;
  fmtDate: (value: string | null) => string | null;
};

/** Anchor for Insight median $/sqft links on listing + Spotlight. */
export const LISTING_ANALYSIS_ID = "listing-analysis";

/** Flash Analysis background after Insight median $/sqft deep-link. */
const ANALYSIS_HIGHLIGHT_MS = 10_000;
const ANALYSIS_HIGHLIGHT_CLASS = "bg-[#2A3D6B]";
const ANALYSIS_IDLE_CLASS = "bg-transparent";

type PriorListing = {
  mlsId: string;
  status: string;
  listDate: string | null;
  price: number | null;
  originalListPrice: number | null;
  closeDate: string | null;
  closePrice: number | null;
  isRental?: boolean;
};

type HistoryResponse = {
  priorListings?: PriorListing[];
};

type AnalysisKind = "sale" | "rental";

type KindAnalysis = {
  kind: AnalysisKind;
  lastList: number;
  closed: number;
  pct: number;
};

function analysisFromPrices(
  kind: AnalysisKind,
  lastList: number | null | undefined,
  closed: number | null | undefined,
): KindAnalysis | null {
  const pct = closedVsLastListPct(lastList, closed);
  if (
    pct == null ||
    lastList == null ||
    closed == null ||
    !Number.isFinite(lastList) ||
    !Number.isFinite(closed)
  ) {
    return null;
  }
  return { kind, lastList, closed, pct };
}

function analysisFromPrior(
  prior: PriorListing,
  kind: AnalysisKind,
): KindAnalysis | null {
  const closed =
    prior.closePrice ??
    (prior.status === "Closed" ? prior.price : null);
  const lastList = prior.price ?? prior.originalListPrice;
  return analysisFromPrices(kind, lastList, closed);
}

export default function ListingDetailsSchoolsPanel({
  mlsId,
  propertyTitle,
  townHint = null,
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
  cityMedianPpsf = null,
  listingPricePerSqft = null,
  medianPpsfBand = null,
  schools,
  fmtMoney,
  fmtDate,
  unframed = false,
}: ListingDetailsSchoolsPanelProps & { unframed?: boolean }) {
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [priorListings, setPriorListings] = useState<PriorListing[]>([]);
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind>(
    isRental ? "rental" : "sale",
  );
  const [analysisHighlighted, setAnalysisHighlighted] = useState(false);
  const analysisHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const analysisDefaultKeyRef = useRef<string>("");
  const panelClass = unframed
    ? listingPanelCompactClass
    : listingFrameCompactClass;
  const hasSchools = Boolean(
    schools.elementary ||
      schools.middle ||
      schools.high ||
      schools.district,
  );

  const flashAnalysisHighlight = () => {
    if (analysisHighlightTimerRef.current != null) {
      clearTimeout(analysisHighlightTimerRef.current);
      analysisHighlightTimerRef.current = null;
    }
    setAnalysisHighlighted(true);
    analysisHighlightTimerRef.current = setTimeout(() => {
      analysisHighlightTimerRef.current = null;
      setAnalysisHighlighted(false);
    }, ANALYSIS_HIGHLIGHT_MS);
  };

  // Insight median link → #listing-analysis: lighten Analysis for 10s.
  useEffect(() => {
    const hashTargetsAnalysis = () =>
      window.location.hash.replace(/^#/, "") === LISTING_ANALYSIS_ID;

    const onHashChange = () => {
      if (hashTargetsAnalysis()) flashAnalysisHighlight();
    };

    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.hash.replace(/^#/, "") !== LISTING_ANALYSIS_ID) return;
        // Highlight Analysis in place — do not scroll the page / move tab chrome.
        event.preventDefault();
        flashAnalysisHighlight();
        const loc = new URL(window.location.href);
        if (loc.hash.replace(/^#/, "") !== LISTING_ANALYSIS_ID) {
          window.history.replaceState(
            null,
            "",
            `${loc.pathname}${loc.search}#${LISTING_ANALYSIS_ID}`,
          );
        }
      } catch {
        /* ignore invalid href */
      }
    };

    if (hashTargetsAnalysis()) flashAnalysisHighlight();
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onDocClick, true);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onDocClick, true);
      if (analysisHighlightTimerRef.current != null) {
        clearTimeout(analysisHighlightTimerRef.current);
        analysisHighlightTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; flash uses refs/state setters
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (townHint?.trim()) params.set("town", townHint.trim());
    const qs = params.toString();
    const url = `/api/listings/${encodeURIComponent(mlsId)}/history${
      qs ? `?${qs}` : ""
    }`;
    const peeked = peekTabJson<HistoryResponse>(url);
    if (peeked?.priorListings) {
      setPriorListings(peeked.priorListings);
    }
    void loadTabJson<HistoryResponse>(url)
      .then((body) => {
        if (cancelled) return;
        setPriorListings(body?.priorListings ?? []);
      })
      .catch(() => {
        if (!cancelled) setPriorListings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId, townHint]);

  const { saleAnalysis, rentalAnalysis, rentalPrice, previouslyRented } =
    useMemo(() => {
      const currentClosed = soldPrice ?? (isClosed ? price : null);
      const currentLastList =
        price ?? (isClosed ? originalListPrice : null);
      const current = isClosed
        ? analysisFromPrices(
            isRental ? "rental" : "sale",
            currentLastList,
            currentClosed,
          )
        : null;

      const priorRentals = priorListings.filter((p) => p.isRental);
      const priorSales = priorListings.filter((p) => !p.isRental);
      const priorRentalAnalysis =
        priorRentals.map((p) => analysisFromPrior(p, "rental")).find(Boolean) ??
        null;
      const priorSaleAnalysis =
        priorSales.map((p) => analysisFromPrior(p, "sale")).find(Boolean) ??
        null;

      const sale =
        (!isRental && current) || priorSaleAnalysis || null;
      const rental =
        (isRental && current) || priorRentalAnalysis || null;

      const rentAmount =
        rental?.closed ??
        priorRentals.find((p) => p.closePrice != null || p.price != null)
          ?.closePrice ??
        priorRentals.find((p) => p.price != null)?.price ??
        (isRental && isClosed ? currentClosed : null) ??
        null;

      return {
        saleAnalysis: sale,
        rentalAnalysis: rental,
        rentalPrice: rentAmount,
        previouslyRented: priorRentals.length > 0 || isRental,
      };
    }, [
      isClosed,
      isRental,
      originalListPrice,
      price,
      priorListings,
      soldPrice,
    ]);

  const showToggle = Boolean(saleAnalysis && rentalAnalysis && previouslyRented);
  const activeAnalysis =
    (analysisKind === "rental" ? rentalAnalysis : saleAnalysis) ??
    saleAnalysis ??
    rentalAnalysis;
  const showMedianPpsf =
    cityMedianPpsf != null && cityMedianPpsf > 0;
  const showAnalysis = Boolean(
    activeAnalysis || (saleAnalysis && rentalPrice) || showMedianPpsf,
  );
  const comparePpsf =
    listingPricePerSqft ??
    (typeof ppsf === "number" ? ppsf : null);
  const medianLabel = townHint?.trim() || "City";
  const medianFmt = showMedianPpsf
    ? formatInsightMedianPpsf(cityMedianPpsf, isRental)
    : null;
  const listingPpsfFmt =
    comparePpsf != null
      ? formatInsightMedianPpsf(comparePpsf, isRental)
      : null;
  const bandCopy =
    medianPpsfBand === "below"
      ? "below median"
      : medianPpsfBand === "above"
        ? "above median"
        : medianPpsfBand === "at"
          ? "at median"
          : null;

  // Set Sale/Rental default once per listing when both sides become available.
  useEffect(() => {
    const key = `${mlsId}:${showToggle}:${Boolean(saleAnalysis)}:${Boolean(rentalAnalysis)}`;
    if (analysisDefaultKeyRef.current === key) return;
    analysisDefaultKeyRef.current = key;
    if (showToggle) {
      setAnalysisKind(isRental ? "rental" : "sale");
      return;
    }
    if (rentalAnalysis && !saleAnalysis) setAnalysisKind("rental");
    else if (saleAnalysis) setAnalysisKind("sale");
  }, [mlsId, showToggle, isRental, saleAnalysis, rentalAnalysis]);

  const saleClosedForCompare =
    saleAnalysis?.closed ??
    (!isRental && isClosed ? (soldPrice ?? price) : null);
  const showClosedVsRent =
    saleClosedForCompare != null &&
    rentalPrice != null &&
    saleClosedForCompare > 0 &&
    rentalPrice > 0;
  const grossYieldPct = showClosedVsRent
    ? Math.round(((rentalPrice * 12) / saleClosedForCompare) * 1000) / 10
    : null;

  return (
    <div className={`${panelClass} space-y-3`}>
      <div>
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold mb-2">
          Details
        </p>
        <div className="space-y-1.5">
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
            <Stat
              label="Price Per Square Foot"
              value={ppsf ? `$${ppsf}` : "—"}
            />
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

      {showAnalysis ? (
        <div
          id={LISTING_ANALYSIS_ID}
          className={`-mx-1 space-y-2 rounded-lg border-t border-white/10 px-1 pt-3 scroll-mt-28 transition-colors duration-700 ease-out ${
            analysisHighlighted
              ? ANALYSIS_HIGHLIGHT_CLASS
              : ANALYSIS_IDLE_CLASS
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold">
              Analysis
            </p>
            {showToggle ? (
              <div
                className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5"
                role="group"
                aria-label="Sale or rental analysis"
              >
                {(
                  [
                    { id: "sale" as const, label: "Sale" },
                    { id: "rental" as const, label: "Rental" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAnalysisKind(option.id)}
                    className={`rounded-full px-2 py-0.5 font-mono text-[8px] tracking-[0.1em] uppercase transition-colors ${
                      analysisKind === option.id
                        ? "bg-gold text-navy"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showMedianPpsf && medianFmt ? (
            <div className="space-y-1">
              <Stat
                label={
                  isRental
                    ? `${medianLabel} rent median $/sqft`
                    : `${medianLabel} median $/sqft`
                }
                value={medianFmt}
                large
              />
              {listingPpsfFmt ? (
                <Stat
                  label={
                    isRental
                      ? "This listing rent $/sqft"
                      : "This listing $/sqft"
                  }
                  value={listingPpsfFmt}
                  large
                  accent={
                    medianPpsfBand === "below"
                      ? "sage"
                      : medianPpsfBand === "above"
                        ? "coral"
                        : undefined
                  }
                />
              ) : null}
              <p className="font-mono text-[9px] leading-snug text-white/45">
                {bandCopy
                  ? `${bandCopy} · `
                  : null}
                {isRental ? "rent-per-sqft" : "price-per-sqft"} vs active peers
              </p>
            </div>
          ) : null}

          {activeAnalysis ? (
            <div className="space-y-1">
              <Stat
                label={
                  activeAnalysis.kind === "rental"
                    ? "Closed vs last list rent"
                    : "Closed vs last list"
                }
                value={`${activeAnalysis.pct}%`}
                large
                accent={
                  activeAnalysis.pct >= 100
                    ? "sage"
                    : activeAnalysis.pct >= 95
                      ? undefined
                      : "coral"
                }
              />
              <p className="font-mono text-[9px] leading-snug text-white/45">
                Closed at {activeAnalysis.pct}% of last list
                {" · "}
                {fmtMoney(activeAnalysis.closed)}
                {" / "}
                {fmtMoney(activeAnalysis.lastList)}
                {activeAnalysis.kind === "rental" ? " rent" : ""}
              </p>
            </div>
          ) : null}

          {showClosedVsRent && analysisKind === "sale" ? (
            <div className="space-y-1.5 border-t border-white/10 pt-2">
              <Stat
                label="Closed price"
                value={fmtMoney(saleClosedForCompare)}
              />
              <Stat
                label="Rental price"
                value={`${fmtMoney(rentalPrice)}/mo`}
              />
              {grossYieldPct != null ? (
                <Stat
                  label="Gross yield"
                  value={`${grossYieldPct}%`}
                  sub="rent × 12 / closed"
                />
              ) : null}
            </div>
          ) : null}

          {analysisKind === "rental" &&
          showClosedVsRent &&
          saleClosedForCompare != null ? (
            <div className="space-y-1.5 border-t border-white/10 pt-2">
              <Stat
                label="Closed price"
                value={fmtMoney(saleClosedForCompare)}
              />
              <Stat
                label="Rental price"
                value={`${fmtMoney(rentalPrice)}/mo`}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {hasSchools ? (
        <div className="border-t border-white/10 pt-3">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-gold mb-1.5">
            Schools
          </p>
          <ul className="space-y-1 text-sm">
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
    "font-mono text-[9px] tracking-[0.14em] uppercase text-white/55 leading-tight";
  const labelLinkClass = `${labelClass} hover:text-gold transition-colors underline decoration-white/25 underline-offset-2`;
  return (
    <div className="flex items-baseline justify-between gap-2">
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
        className={`shrink-0 font-mono tabular-nums leading-tight ${
          large ? "text-lg" : "text-sm"
        } ${color}`}
      >
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-white/50">{sub}</span>}
      </span>
    </div>
  );
}

function SchoolRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/45 shrink-0">
        {label}
      </span>
      <span className="text-xs text-white/85 text-right leading-snug">{value}</span>
    </li>
  );
}
