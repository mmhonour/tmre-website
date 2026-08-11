import { listUpcomingFedMarketEvents } from "@/lib/fed-markets-upcoming";
import type { CpiRelease } from "@/lib/cpi-calendar";
import type { FomcMeeting } from "@/lib/fed-fomc-calendar";

/**
 * Next-3-months FOMC + CPI dates under the FOMC decision / Prevailing CPI
 * panels. Built from live calendars (refreshed after Fed sync).
 */
export default function FedUpcomingDates({
  meetings,
  releases,
  now = new Date(),
  months = 3,
}: {
  meetings: readonly FomcMeeting[];
  releases: readonly CpiRelease[];
  now?: Date;
  months?: number;
}) {
  const events = listUpcomingFedMarketEvents(now, meetings, releases, months);

  return (
    <div className="border-t border-charcoal/[0.08] px-5 py-4 sm:px-6 lg:px-8">
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
        Next {months} months
      </p>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-slate">
          No FOMC or CPI dates in the next {months} months on the live calendar.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {events.map((ev) => (
            <li
              key={ev.key}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
            >
              <span
                className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                  ev.kind === "fomc" ? "text-navy" : "text-sky"
                }`}
              >
                {ev.kind === "fomc" ? "FOMC" : "CPI"}
              </span>
              <span className="text-navy">{ev.headline}</span>
              <span className="text-slate">· {ev.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
