import type { FomcMeeting } from "@/lib/fed-fomc-calendar";

/**
 * Official statement text stored by Fed sync — disclosed as Fed language, not AI.
 */
export default function FedStatementSummary({
  meeting,
}: {
  meeting: FomcMeeting | null;
}) {
  if (!meeting?.summary && !meeting?.excerpt) {
    return (
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Statement summary
        </p>
        <p className="mt-3 text-sm text-slate">
          No stored summary yet. Run{" "}
          <span className="font-mono text-xs text-navy">Admin → Communications → Fed sync</span>{" "}
          after the statement posts — we store paragraphs grepped from the official
          release (not AI-written).
        </p>
      </div>
    );
  }

  const body = meeting.summary || meeting.excerpt || "";

  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Statement summary
        </p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
          From the official FOMC statement
        </p>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate">
        {body.split(/\n\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {meeting.voteNote ? (
        <p className="mt-4 border-t border-charcoal/[0.08] pt-3 text-xs leading-relaxed text-charcoal/55">
          {meeting.voteNote}
        </p>
      ) : null}
      {meeting.statementUrl ? (
        <a
          href={meeting.statementUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
        >
          Full statement
        </a>
      ) : null}
    </div>
  );
}
