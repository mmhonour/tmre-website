import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcDayWithWeekday,
  getNextFomcMeeting,
  parseFomcYmd,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function monthsAgo(now: Date, months: number): Date {
  return startOfLocalDay(
    new Date(now.getFullYear(), now.getMonth() - months, now.getDate()),
  );
}

function decisionTone(decision: FomcMeeting["decision"]): {
  dot: string;
  label: string;
} {
  if (decision === "cut") {
    return { dot: "bg-sage border-sage", label: "text-sage" };
  }
  if (decision === "hike") {
    return { dot: "bg-coral border-coral", label: "text-coral" };
  }
  if (decision === "hold") {
    return { dot: "bg-navy border-navy", label: "text-navy" };
  }
  return { dot: "bg-gold border-gold", label: "text-navy" };
}

function monthTicks(from: Date, to: Date): { key: string; leftPct: number; label: string }[] {
  const span = Math.max(to.getTime() - from.getTime(), 1);
  const ticks: { key: string; leftPct: number; label: string }[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  if (cursor.getTime() < from.getTime()) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  while (cursor.getTime() <= to.getTime()) {
    const leftPct = ((cursor.getTime() - from.getTime()) / span) * 100;
    ticks.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      leftPct,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(cursor),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return ticks;
}

export function selectTimelineMeetings(
  now: Date,
  meetings: readonly FomcMeeting[],
): { points: FomcMeeting[]; next: FomcMeeting | null; from: Date; to: Date } {
  const from = monthsAgo(now, 12);
  const next = getNextFomcMeeting(now, meetings);
  const past = meetings
    .filter((m) => {
      const end = parseFomcYmd(m.endDate);
      return (
        end.getTime() >= from.getTime() &&
        end.getTime() <= now.getTime() &&
        m.decision != null
      );
    })
    .sort(
      (a, b) =>
        parseFomcYmd(a.endDate).getTime() - parseFomcYmd(b.endDate).getTime(),
    );

  const points =
    next && !past.some((m) => m.id === next.id) ? [...past, next] : [...past];

  const lastPoint = points[points.length - 1];
  const to = lastPoint
    ? parseFomcYmd(lastPoint.endDate)
    : new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());

  return { points, next, from, to: startOfLocalDay(to) };
}

export default function FedDecisionTimeline({
  meetings,
  now = new Date(),
}: {
  meetings: readonly FomcMeeting[];
  now?: Date;
}) {
  const { points, next, from, to } = selectTimelineMeetings(now, meetings);
  const span = Math.max(to.getTime() - from.getTime(), 1);
  const ticks = monthTicks(from, to);
  const todayPct = Math.min(
    100,
    Math.max(0, ((startOfLocalDay(now).getTime() - from.getTime()) / span) * 100),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Decision timeline
        </p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
          Last 12 months + next FOMC
        </p>
      </div>

      {points.length === 0 ? (
        <p className="mt-4 text-sm text-slate">
          No decided meetings in the last 12 months yet.
        </p>
      ) : (
        <>
          {/* Desktop / tablet horizontal plot */}
          <div className="mt-6 hidden md:block">
            <div className="relative h-40">
              <div
                className="absolute top-[4.25rem] right-0 left-0 h-px bg-charcoal/15"
                aria-hidden
              />
              <div
                className="absolute top-8 bottom-8 w-px bg-gold/50"
                style={{ left: `${todayPct}%` }}
                aria-hidden
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.14em] uppercase text-gold">
                  Today
                </span>
              </div>

              {ticks.map((t) => (
                <div
                  key={t.key}
                  className="absolute top-[4.25rem] -translate-x-1/2"
                  style={{ left: `${t.leftPct}%` }}
                >
                  <div className="h-2 w-px bg-charcoal/20" aria-hidden />
                  <p className="mt-1 -translate-x-1/2 font-mono text-[9px] tracking-[0.08em] uppercase text-charcoal/40">
                    {t.label}
                  </p>
                </div>
              ))}

              {points.map((m, i) => {
                const t = parseFomcYmd(m.endDate).getTime();
                const leftPct = ((t - from.getTime()) / span) * 100;
                const isNext = next?.id === m.id && m.decision == null;
                const tone = decisionTone(m.decision);
                const above = i % 2 === 0;
                return (
                  <div
                    key={m.id}
                    className="absolute top-[4.25rem] w-36 -translate-x-1/2"
                    style={{ left: `${leftPct}%` }}
                  >
                    <div
                      className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                        isNext
                          ? "border-dashed border-gold bg-cream"
                          : tone.dot
                      }`}
                      aria-hidden
                    />
                    <div
                      className={`absolute left-1/2 w-36 -translate-x-1/2 text-center ${
                        above ? "bottom-4" : "top-4"
                      }`}
                    >
                      <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-charcoal/45">
                        {formatFomcDayWithWeekday(m.endDate, {
                          month: "short",
                          year: false,
                        })}
                      </p>
                      <p
                        className={`mt-0.5 font-mono text-[11px] tracking-[0.08em] uppercase ${
                          isNext ? "text-gold" : tone.label
                        }`}
                      >
                        {isNext
                          ? "Next"
                          : decisionLabel(m.decision, m.basisPoints)}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-navy">
                        {isNext
                          ? "Pending"
                          : formatFedFundsRange(
                              m.targetRangeLow,
                              m.targetRangeHigh,
                            )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sage" aria-hidden /> Cut
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-navy" aria-hidden /> Hold
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-coral" aria-hidden /> Hike
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full border border-dashed border-gold bg-cream"
                  aria-hidden
                />{" "}
                Next
              </li>
            </ul>
          </div>

          {/* Mobile vertical timeline */}
          <ol className="mt-5 space-y-0 md:hidden">
            {points.map((m, i) => {
              const isNext = next?.id === m.id && m.decision == null;
              const tone = decisionTone(m.decision);
              return (
                <li key={m.id} className="flex gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span
                      className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                        isNext
                          ? "border-dashed border-gold bg-cream"
                          : tone.dot
                      }`}
                      aria-hidden
                    />
                    {i < points.length - 1 ? (
                      <span
                        className="mt-1 w-px flex-1 bg-charcoal/15"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className={`min-w-0 pb-5 ${i === points.length - 1 ? "pb-0" : ""}`}>
                    <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/45">
                      {formatFomcDayWithWeekday(m.endDate, { month: "short" })}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[12px] tracking-[0.08em] uppercase ${
                        isNext ? "text-gold" : tone.label
                      }`}
                    >
                      {isNext
                        ? "Next meeting"
                        : decisionLabel(m.decision, m.basisPoints)}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] tabular-nums text-navy">
                      {isNext
                        ? "Decision pending"
                        : formatFedFundsRange(
                            m.targetRangeLow,
                            m.targetRangeHigh,
                          )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
