import { listUpcomingFedMarketEvents } from "@/lib/fed-markets-upcoming";
import type { CpiRelease } from "@/lib/cpi-calendar";
import type { FomcMeeting } from "@/lib/fed-fomc-calendar";

/**
 * Next-N-months FOMC or CPI dates under the matching policy column.
 * Built from live calendars (refreshed after Fed sync).
 */
export default function FedUpcomingDates({
  meetings,
  releases,
  now = new Date(),
  months = 3,
  kind,
}: {
  meetings: readonly FomcMeeting[];
  releases: readonly CpiRelease[];
  now?: Date;
  months?: number;
  /** Show only this event kind under its parent panel. */
  kind: "fomc" | "cpi";
}) {
  const events = listUpcomingFedMarketEvents(
    now,
    meetings,
    releases,
    months,
  ).filter((ev) => ev.kind === kind);

  const label = kind === "fomc" ? "FOMC" : "CPI";

  return (
    <div className="mt-auto border-t border-charcoal/[0.08] pt-4">
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
        Next {months} months · {label}
      </p>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-slate">
          No {label} dates in the next {months} months on the live calendar.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {events.map((ev) => (
            <li
              key={ev.key}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
            >
              <span className="text-navy">{ev.headline}</span>
              <span className="text-slate">· {ev.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
