"use client";

import { useState } from "react";
import type { FomcMeeting } from "@/lib/fed-fomc-calendar";
import { parseFomcVoteBreakdown } from "@/lib/fed-fomc-statement-parse";

function VoterList({
  names,
  empty,
}: {
  names: string[];
  empty: string;
}) {
  if (names.length === 0) {
    return <p className="text-sm leading-relaxed text-charcoal/50">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {names.map((name) => (
        <li
          key={name}
          className="text-sm leading-snug text-navy/90 before:mr-2 before:text-charcoal/30 before:content-['·']"
        >
          {name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Footer links on the Prevailing decision card: Statement summary (toggle) left,
 * Read statement (official URL) right. Panel content is hidden until toggled.
 */
export default function FedStatementSummary({
  meeting,
}: {
  meeting: FomcMeeting | null;
}) {
  const [open, setOpen] = useState(false);

  const hasPanel =
    Boolean(meeting?.summary) ||
    Boolean(meeting?.excerpt) ||
    Boolean(meeting?.voteNote);
  const body = meeting?.summary || meeting?.excerpt || "";
  const votes = meeting
    ? parseFomcVoteBreakdown(meeting.voteNote, {
        note: meeting.note,
        summary: meeting.summary,
      })
    : null;

  return (
    <div className="mt-auto pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-charcoal/[0.08] pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasPanel}
          aria-expanded={open}
          aria-controls="fed-statement-summary-panel"
          className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy disabled:cursor-not-allowed disabled:text-charcoal/35 disabled:no-underline"
        >
          {open ? "Hide statement summary" : "Statement summary"}
        </button>
        {meeting?.statementUrl ? (
          <a
            href={meeting.statementUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
          >
            Read statement
          </a>
        ) : (
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/30">
            Read statement
          </span>
        )}
      </div>

      {open && hasPanel && meeting ? (
        <div
          id="fed-statement-summary-panel"
          className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream/25 px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              Statement summary
            </p>
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
              Official FOMC language · not AI
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-charcoal/50">
            Short excerpts from the Committee&apos;s published statement for the
            prevailing decision
            {meeting.endDate ? ` (${meeting.endDate})` : ""}.
          </p>

          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-start">
            <div>
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
                Statement
              </p>
              {body ? (
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate">
                  {body.split(/\n\n+/).map((para, i) => (
                    <p
                      key={i}
                      className={
                        i === 0 ? "font-medium text-navy/90" : undefined
                      }
                    >
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-charcoal/50">
                  No statement paragraphs stored yet — vote detail is available
                  from the release.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-charcoal/[0.08] bg-white/70 px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
                  Committee vote
                </p>
                {votes?.forCount != null && votes.againstCount != null ? (
                  <p className="font-mono text-[11px] tabular-nums tracking-[0.08em] uppercase text-navy">
                    {votes.forCount}–{votes.againstCount}
                  </p>
                ) : null}
              </div>

              {votes ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-sage">
                      Voting for
                      {votes.forCount != null ? ` (${votes.forCount})` : ""}
                    </p>
                    <div className="mt-2">
                      <VoterList
                        names={votes.forNames}
                        empty={
                          votes.forCount != null
                            ? `Majority of ${votes.forCount} — statement did not list names`
                            : "Names not listed in the statement"
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-coral">
                      Voting against
                      {votes.againstCount != null
                        ? ` (${votes.againstCount})`
                        : ""}
                    </p>
                    <div className="mt-2">
                      <VoterList
                        names={votes.againstNames}
                        empty="No dissenting votes recorded"
                      />
                    </div>
                    {votes.againstPreference ? (
                      <p className="mt-3 text-xs leading-relaxed text-charcoal/55">
                        Preferred {votes.againstPreference}.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : meeting.voteNote ? (
                <p className="mt-3 text-sm leading-relaxed text-slate">
                  {meeting.voteNote}
                </p>
              ) : (
                <p className="mt-3 text-sm text-charcoal/50">
                  No vote detail stored for this meeting yet.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
