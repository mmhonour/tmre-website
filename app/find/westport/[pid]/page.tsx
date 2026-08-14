import Link from "next/link";
import { notFound } from "next/navigation";
import { mergeWestportProperty, type MergedField } from "@/lib/westport-lookup";
import { westportFieldCardHref, westportParcelHref } from "@/lib/listing-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const property = await mergeWestportProperty(pid);
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
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const text =
    value == null || value === ""
      ? "—"
      : typeof value === "number"
        ? String(value)
        : value;
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
  const fieldSections = card.fields.reduce<
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
              Vision field card
            </h2>
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
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </dl>
                </div>
              ))
            )}

            <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] tracking-[0.08em] uppercase">
              {card.r2Key ? (
                <a
                  href={westportFieldCardHref(property.visionPid)}
                  className="text-gold underline underline-offset-2 hover:text-navy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Field Card
                </a>
              ) : null}
              {card.parcelUrl ? (
                <a
                  href={card.parcelUrl}
                  className="text-slate/60 underline underline-offset-2 hover:text-navy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Vision GIS
                </a>
              ) : null}
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
