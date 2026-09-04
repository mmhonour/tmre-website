import Link from "next/link";
import { notFound } from "next/navigation";
import { mergeWestportProperty, type MergedField } from "@/lib/westport-lookup";
import { westportFieldCardHref, westportParcelHref } from "@/lib/listing-url";
import {
  formatVisionFieldValue,
  formatVisionMoney,
  isVisionQuitclaim,
  visionInstrumentLabel,
  type VisionOwnershipRow,
} from "@/lib/vision-gis-parse";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const property = await mergeWestportProperty(pid, { ingest: false });
  const label = property?.street?.trim() || `Westport parcel ${pid}`;
  return {
    title: `${label} — Westport Lookup — TMRE`,
    description: property
      ? `${property.addressFull}. ${property.listing ? "On market — MLS merged with Vision." : "Off market — Vision parcel."}`
      : `Westport parcel ${pid}.`,
  };
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function FieldRow<T extends string | number>({
  label,
  field,
  format,
}: {
  label: string;
  field: MergedField<T>;
  format?: (v: T) => string;
}) {
  const text =
    field.value == null
      ? "—"
      : format
        ? format(field.value)
        : String(field.value);
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-charcoal/[0.06]">
      <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/70">
        {label}
      </dt>
      <dd className="text-right">
        <span className="font-mono text-sm text-navy tabular-nums">{text}</span>
        {field.source ? (
          <span className="ml-2 font-mono text-[9px] tracking-[0.08em] uppercase text-slate/45">
            {field.source === "listing" ? "MLS" : "Vision"}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function CardRow({
  section,
  label,
  value,
}: {
  section: string;
  label: string;
  value: string | number | null | undefined;
}) {
  const raw =
    value == null || value === ""
      ? ""
      : typeof value === "number"
        ? String(value)
        : value;
  const text = raw ? formatVisionFieldValue(section, label, raw) : "—";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-charcoal/[0.06]">
      <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/70">
        {label}
      </dt>
      <dd className="font-mono text-[13px] text-navy tabular-nums text-right max-w-[65%]">
        {text}
      </dd>
    </div>
  );
}

function SalesHistoryTable({ rows }: { rows: VisionOwnershipRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm text-slate/60">
        No recorded transactions on the Vision Field Card.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left">
        <thead>
          <tr className="border-b border-charcoal/[0.1]">
            {["Date", "Owner", "Price", "Book / page", "Deed"].map(
              (h) => (
                <th
                  key={h}
                  className="py-2 pr-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55 font-normal"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.date}-${row.owner}-${row.bookPage}-${i}`}
              className="border-b border-charcoal/[0.06]"
            >
              <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                {row.date || "—"}
              </td>
              <td className="py-2 pr-3 font-mono text-[13px] text-navy">
                {row.owner || "—"}
              </td>
              <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                {isVisionQuitclaim(row)
                  ? "—"
                  : formatVisionMoney(row.price) ?? row.price ?? "—"}
              </td>
              <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                {row.bookPage || "—"}
              </td>
              <td className="py-2 font-mono text-[13px] text-navy">
                {visionInstrumentLabel(row.instrument) ??
                  (isVisionQuitclaim(row) ? "Quitclaim" : row.qualified || "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function WestportParcelPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const property = await mergeWestportProperty(pid.trim());
  if (!property) notFound();

  const onMarket = property.listing != null;
  const baths =
    property.beds.value != null && property.baths.value != null
      ? `${property.beds.value}BR/${property.baths.value}BA`
      : null;
  const card = property.fieldCard;
  const visibleFields = card.fields.filter(
    (field) =>
      !/^(valuation|sale|ownership)$/i.test(field.section) &&
      !/^(pan |row |grd |tbl |ctl|current Val)/i.test(field.label) &&
      field.label.length < 48,
  );
  const fieldSections = visibleFields.reduce<
    { section: string; fields: typeof card.fields }[]
  >((acc, field) => {
    const last = acc[acc.length - 1];
    if (last && last.section === field.section) {
      last.fields.push(field);
      return acc;
    }
    acc.push({ section: field.section, fields: [field] });
    return acc;
  }, []);

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-24 lg:pb-10 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          {property.listingIngested && property.listing ? (
            <div className="mb-5 rounded-xl border border-gold/45 bg-gold/15 px-4 py-3">
              <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-gold">
                Listing is available
              </p>
              <p className="mt-1 text-sm text-white/80">
                Pulled from RETS and stored in listings · MLS #
                {property.listing.mlsId}
                {property.listing.status ? ` · ${property.listing.status}` : ""}.
              </p>
            </div>
          ) : null}
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            <Link href="/find" className="hover:text-white transition-colors">
              Find · Westport
            </Link>
            {onMarket ? " · On market" : " · Off market"}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-white leading-[1.08] max-w-3xl">
            {property.street}
          </h1>
          <p className="mt-3 font-mono text-sm text-white/70">
            {property.addressFull}
          </p>
          <div className="mt-6 max-w-xl rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
              Owner of record
            </p>
            <p className="mt-1 font-serif text-xl sm:text-2xl text-white leading-snug">
              {property.ownerDisplayName ?? "—"}
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/45">
                  Mailing address
                </dt>
                <dd className="mt-0.5 font-mono text-sm text-white/85 leading-relaxed">
                  {property.ownerMailingAddress ?? "Pending Field Card"}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/45">
                  Bought
                </dt>
                <dd className="mt-0.5 font-mono text-sm text-white/85 tabular-nums">
                  {property.purchaseDate ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
          <p className="mt-4 font-mono text-2xl text-gold tabular-nums">
            {property.price.value != null
              ? fmtMoney(property.price.value)
              : "Off market"}
          </p>
          {baths || property.style.value ? (
            <p className="mt-2 font-mono text-[11px] tracking-[0.08em] uppercase text-white/50">
              {[baths, property.style.value].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {property.listing ? (
            <p className="mt-6">
              <Link
                href={property.listing.href}
                className="inline-block rounded-full bg-gold px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-[#131F38] hover:bg-gold/90 transition-colors"
              >
                Full listing · MLS #{property.listing.mlsId}
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
          <div>
            {property.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 mb-8">
                {property.photos.slice(0, 4).map((src) => (
                  // MLS / Vision URLs are not all in next/image remotePatterns.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="w-full aspect-[4/3] object-cover rounded-xl bg-navy/10"
                  />
                ))}
              </div>
            ) : null}

            {property.listing ? (
              <>
                {property.remarks.value ? (
                  <p className="font-serif text-base leading-relaxed text-charcoal/80 mb-8">
                    {property.remarks.value}
                  </p>
                ) : null}
                <h2 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-2">
                  MLS
                </h2>
                <dl className="mb-10">
                  <FieldRow label="Status" field={property.status} />
                  <FieldRow
                    label="Price"
                    field={property.price}
                    format={(v) => fmtMoney(Number(v))}
                  />
                  <FieldRow label="DOM" field={property.dom} format={(v) => `${v}d`} />
                  <FieldRow label="Beds" field={property.beds} />
                  <FieldRow label="Baths" field={property.baths} />
                  <FieldRow
                    label="Sqft"
                    field={property.sqft}
                    format={(v) => Number(v).toLocaleString()}
                  />
                  <FieldRow label="Year" field={property.yearBuilt} />
                  <FieldRow label="Style" field={property.style} />
                </dl>
              </>
            ) : null}

            <h2 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-2">
              Valuation
            </h2>
            <dl className="mb-10">
              <FieldRow
                label="Assessment"
                field={property.assessedValue}
                format={(v) => formatVisionMoney(Number(v)) ?? "—"}
              />
              <FieldRow
                label="Appraisal"
                field={property.appraisalValue}
                format={(v) => formatVisionMoney(Number(v)) ?? "—"}
              />
              <FieldRow
                label={
                  property.lastSalePrice.value === 0 ? "Last quitclaim" : "Last sale"
                }
                field={property.lastSalePrice}
                format={(v) =>
                  Number(v) === 0
                    ? "No consideration"
                    : formatVisionMoney(Number(v)) ?? "—"
                }
              />
              <FieldRow
                label={
                  property.lastSalePrice.value === 0
                    ? "Quitclaim date"
                    : "Sale date"
                }
                field={property.lastSaleDate}
              />
              <FieldRow label="Book / page" field={property.lastSaleBookPage} />
              <FieldRow label="Owner" field={property.ownerName} />
            </dl>

            <h2 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-2">
              Sales history
            </h2>
            <p className="mb-3 font-mono text-[10px] tracking-[0.06em] text-slate/50">
              Vision Ownership History. A $0 / instrument 29 row is a quitclaim
              — name(s) on record without warranty — not a purchase. Bought is
              the last deed with consideration.
            </p>
            <div className="mb-10">
              <SalesHistoryTable rows={card.ownership} />
            </div>

            <h2 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-2">
              Vision field card
            </h2>
            {card.storedJson ? (
              <p className="mb-3 font-mono text-[10px] tracking-[0.06em] text-slate/50">
                Fields below are assimilated from the VGSI Field Card (parcel page + official PDF).
              </p>
            ) : null}
            {fieldSections.length === 0 ? (
              <p className="font-mono text-sm text-slate/60">
                No parsed Field Card fields yet.
              </p>
            ) : (
              fieldSections.map((group) => (
                <div key={group.section} className="mb-5">
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/45 mb-1">
                    {group.section}
                  </p>
                  <dl>
                    {group.fields.map((field) => (
                      <CardRow
                        key={`${group.section}-${field.label}-${field.value}`}
                        section={group.section}
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </dl>
                </div>
              ))
            )}

            <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] tracking-[0.08em] uppercase">
              {card.parcelUrl ? (
                <a
                  href={card.parcelUrl}
                  className="text-gold underline underline-offset-2 hover:text-navy"
                  target="_blank"
                  rel="noreferrer"
                >
                  VGSI Parcel
                </a>
              ) : null}
              <a
                href={westportFieldCardHref(property.visionPid)}
                className="text-gold underline underline-offset-2 hover:text-navy"
                target="_blank"
                rel="noreferrer"
              >
                Field Card
              </a>
            </p>
          </div>

          {property.siblings.length > 0 ? (
            <aside className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 h-fit">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-3">
                Other parcels at this address
              </p>
              <ul className="space-y-2">
                {property.siblings.map((sib) => (
                  <li key={sib.visionPid}>
                    <Link
                      href={westportParcelHref(sib.visionPid)}
                      className="block rounded-xl px-3 py-2 hover:bg-cream transition-colors"
                    >
                      <span className="block text-sm text-navy">
                        {sib.street}
                      </span>
                      <span className="font-mono text-[10px] text-slate/60">
                        {[sib.mblu ? `MBLU ${sib.mblu}` : `PID ${sib.visionPid}`, sib.ownerName]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    </>
  );
}
