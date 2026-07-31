import Link from "next/link";
import { contentViewLabel, type ContentViewSummary } from "@/lib/content-views";
import { formatExactCompactPrice } from "@/lib/format-exact-compact-price";

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function metaLine(row: ContentViewSummary): string {
  if (row.kind === "page") return row.path;
  const parts = [row.town, row.status].filter(Boolean) as string[];
  if (typeof row.price === "number" && row.price > 0) {
    parts.push(formatExactCompactPrice(row.price));
  }
  // Short MLS number only — long Matrix keys already appear as the unresolved title.
  if (row.mlsId && row.mlsId.length <= 16) {
    parts.push(`MLS ${row.mlsId}`);
  }
  return parts.join(" · ");
}

function Row({ row, rank }: { row: ContentViewSummary; rank: number }) {
  const label = contentViewLabel(row);
  return (
    <li className="flex items-start justify-between gap-4 px-5 sm:px-6 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="font-mono text-[11px] tabular-nums text-charcoal/35">
          {rank}
        </span>
        <div className="min-w-0">
          {row.kind === "listing" && row.mlsId ? (
            <Link
              href={`/listings/${row.mlsId}`}
              className="text-sm text-navy hover:text-gold hover:underline underline-offset-2 break-words"
            >
              {label}
            </Link>
          ) : (
            <p className="text-sm text-navy break-words">{label}</p>
          )}
          <p className="mt-0.5 font-mono text-[10px] text-charcoal/40 break-words">
            {metaLine(row)}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-charcoal/55">
        <p>
          <span className="font-semibold text-navy">
            {row.views.toLocaleString()}
          </span>{" "}
          views
        </p>
        <p className="text-charcoal/40">
          {row.viewers.toLocaleString()} visitor
          {row.viewers === 1 ? "" : "s"} · {formatDay(row.lastViewedAt)}
        </p>
      </div>
    </li>
  );
}

export default function MostViewedCard({
  title,
  note,
  rows,
  emptyMessage,
  id,
}: {
  title: string;
  note?: string;
  rows: ContentViewSummary[];
  emptyMessage: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 sm:px-6 py-4">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {title}
        </p>
        {note ? (
          <p className="mt-1 text-xs leading-snug text-charcoal/55">{note}</p>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y divide-charcoal/[0.08]">
          {rows.map((row, index) => (
            <Row key={row.contentKey} row={row} rank={index + 1} />
          ))}
        </ul>
      ) : (
        <p className="px-5 sm:px-6 py-6 text-sm text-charcoal/55">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
