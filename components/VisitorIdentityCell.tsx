import {
  formatVisitorIdentity,
  visitorIdentitySourceLabel,
  visitorIsAdmin,
  visitorZip,
  type VisitorRecord,
} from "@/lib/visitors-types";

export default function VisitorIdentityCell({
  visitor,
}: {
  visitor: VisitorRecord;
}) {
  const zip = visitorZip(visitor);
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
        {formatVisitorIdentity(visitor)}
      </p>
      {visitorIsAdmin(visitor) ? (
        <p className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-gold">
          You · Admin
        </p>
      ) : null}
      {zip ? (
        <p className="mt-1 font-mono text-[11px] tabular-nums text-navy/70">
          ZIP {zip}
        </p>
      ) : null}
      {visitor.phone ? (
        <p className="mt-1 font-mono text-[11px] tabular-nums text-navy/70">
          {visitor.phone}
        </p>
      ) : null}
      {visitor.audienceType ? (
        <p className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-gold">
          {visitor.audienceType}
        </p>
      ) : null}
      {visitor.identitySources && visitor.identitySources.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {visitor.identitySources.map((source) => (
            <span
              key={source}
              className="inline-flex rounded-full border border-charcoal/15 bg-cream/60 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/55"
            >
              {visitorIdentitySourceLabel(source)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
