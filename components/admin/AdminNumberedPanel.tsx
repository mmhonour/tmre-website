import type { ReactNode } from "react";

/** Numbered panel chrome matching Database sync step badges. */
export default function AdminNumberedPanel({
  number,
  title,
  subtitle,
  id,
  paused,
  pauseLabel,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  id?: string;
  /** When true, show that this job is paused on the Database tab. */
  paused?: boolean;
  pauseLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white font-mono text-xs font-bold tabular-nums text-navy"
            title={`Syncs overview panel ${number}`}
          >
            {number}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                {title}
              </p>
              {paused ? (
                <span
                  className="inline-flex items-center rounded-full border border-coral/30 bg-coral/10 px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-coral"
                  title="Paused on Admin → Database sync table"
                >
                  {pauseLabel ?? "Paused on Database tab"}
                </span>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm text-charcoal/65">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </div>
  );
}
