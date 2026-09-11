import {
  formatOpenHouseDate,
  formatOpenHouseType,
  formatOpenHouseWhenShort,
  type ListingOpenHouse,
} from "@/lib/open-houses";

type Variant = "panel" | "page" | "modal" | "side";

export function ListingOpenHouseHistory({
  events,
  currentMlsId,
  variant,
}: {
  events: readonly ListingOpenHouse[];
  currentMlsId?: string | null;
  variant: Variant;
}) {
  if (events.length === 0) return null;

  const isModal = variant === "modal";
  const isSide = variant === "side";
  const isPage = variant === "page";

  const sectionTitleClass = isModal
    ? "font-mono text-[10px] tracking-[0.15em] uppercase text-slate mb-3"
    : "font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mb-3";
  const dateClass = isModal
    ? "font-mono text-[10px] text-slate shrink-0 w-24 pt-0.5"
    : isSide
      ? "font-mono text-[9px] text-white/40 shrink-0 w-20 pt-0.5"
      : "font-mono text-[10px] text-white/40 shrink-0 w-24 pt-0.5";
  const labelClass = isModal ? "text-charcoal" : "text-white/85";
  const detailClass = isModal
    ? "block text-slate text-xs mt-0.5"
    : isSide
      ? "block text-white/55 text-[11px] mt-0.5"
      : "block text-white/55 text-xs mt-0.5";
  const rowTextClass = isSide ? "text-[12px]" : "text-sm";

  const currentId = currentMlsId?.trim() ?? "";

  return (
    <div
      className={
        isPage
          ? "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
          : isModal
            ? "rounded-2xl border border-charcoal/[0.08] bg-cream/40 p-4"
            : isSide
              ? "border-t border-white/10 pt-3"
              : "border-t border-white/10 pt-5"
      }
    >
      <p className={sectionTitleClass}>Open houses</p>
      <ul className={isSide ? "space-y-2" : "space-y-3"}>
        {events.map((event) => {
          const priorId = event.listingId.trim();
          const fromPrior = Boolean(currentId && priorId && priorId !== currentId);
          return (
            <li key={event.id} className={`flex gap-3 ${rowTextClass}`}>
              <span className={dateClass}>{formatOpenHouseDate(event.date)}</span>
              <span className={labelClass}>
                {event.upcoming ? "Upcoming" : "Held"}
                {` · ${formatOpenHouseType(event.type)}`}
                <span className={detailClass}>
                  {formatOpenHouseWhenShort(event)}
                  {event.comment ? ` · ${event.comment}` : ""}
                  {fromPrior ? ` · prior #${priorId}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
