"use client";

import { useEffect, useId, useRef } from "react";
import {
  TOWN_ACTIVATION_PHASES,
  TOWN_ACTIVATION_SURFACES,
  TOWN_ACTIVATION_TODAY_WARNING,
  townActivationExampleNote,
} from "@/lib/town-activation-playbook";

export type TownActivationPlaybookTarget = {
  id: string;
  name: string;
  countyName: string;
  active: boolean;
  mlsCityCode: string | null;
};

export type TownActivationPlaybookMode = "activate" | "review" | "deactivate";

type Props = {
  town: TownActivationPlaybookTarget;
  mode: TownActivationPlaybookMode;
  busy?: boolean;
  onClose: () => void;
  onConfirmActivate: () => void;
  onConfirmDeactivate: () => void;
};

export default function AdminTownActivationPlaybookPanel({
  town,
  mode,
  busy = false,
  onClose,
  onConfirmActivate,
  onConfirmDeactivate,
}: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const exampleNote = townActivationExampleNote(town.name);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 backdrop-blur-[1px]"
        aria-label="Close activation playbook"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col border-l border-charcoal/10 bg-white shadow-2xl shadow-navy/20 sm:max-w-lg"
      >
        <header className="shrink-0 border-b border-charcoal/[0.08] bg-cream/50 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-gold">
                Town activation playbook
              </p>
              <h2
                id={titleId}
                className="mt-1 font-serif text-2xl text-navy truncate"
              >
                {town.name}
              </h2>
              <p className="mt-1 font-mono text-[10px] tracking-wide text-charcoal/50">
                {town.countyName} County
                {town.mlsCityCode ? ` · MLS ${town.mlsCityCode}` : " · no MLS code yet"}
                {town.active ? " · currently active" : " · inactive"}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              disabled={busy}
              className="shrink-0 rounded-full border border-charcoal/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/55 hover:border-charcoal/30 hover:text-navy disabled:opacity-40"
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate">
            Same checklist for every town going forward. County expansion later
            does not invent a second process — only who can enter Phase 0.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          <div className="rounded-xl border border-amber-500/25 bg-amber-50/80 px-3.5 py-3">
            <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-amber-800/80">
              Before you activate
            </p>
            <p className="mt-1.5 text-sm leading-snug text-amber-950/85">
              {TOWN_ACTIVATION_TODAY_WARNING}
            </p>
            {exampleNote ? (
              <p className="mt-2 font-mono text-[10px] leading-snug text-amber-900/70">
                {exampleNote}
              </p>
            ) : null}
          </div>

          <section>
            <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 mb-2">
              Phases
            </h3>
            <ol className="space-y-2.5">
              {TOWN_ACTIVATION_PHASES.map((phase) => (
                <li
                  key={phase.id}
                  className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-3.5 py-3"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy">
                      Phase {phase.phase}
                    </span>
                    <span className="font-serif text-base text-navy">
                      {phase.title.replace("{town}", town.name)}
                    </span>
                    <span
                      className={`ml-auto font-mono text-[9px] tracking-[0.12em] uppercase ${
                        phase.status === "now"
                          ? "text-sage"
                          : "text-charcoal/40"
                      }`}
                    >
                      {phase.status === "now" ? "Available now" : "Build later"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-slate">
                    {phase.summary}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {phase.bullets.map((b) => (
                      <li
                        key={b}
                        className="font-mono text-[10px] leading-snug text-charcoal/55 pl-3 relative before:absolute before:left-0 before:content-['·']"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 mb-2">
              Surfaces when public (later)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
              <table className="w-full min-w-[20rem] border-collapse text-left">
                <thead>
                  <tr className="bg-cream/50">
                    <th className="px-2.5 py-2 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40">
                      Surface
                    </th>
                    <th className="px-2.5 py-2 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40">
                      Depends on
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TOWN_ACTIVATION_SURFACES.map((row) => (
                    <tr
                      key={row.surface}
                      className="border-t border-charcoal/[0.06]"
                    >
                      <td className="px-2.5 py-2 text-[12px] text-navy align-top">
                        {row.surface}
                        <p className="mt-0.5 font-mono text-[9px] text-charcoal/40">
                          {row.notes}
                        </p>
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[10px] text-charcoal/55 align-top">
                        {row.dependsOn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className="shrink-0 border-t border-charcoal/[0.08] bg-cream/40 px-5 py-4 space-y-2">
          {mode === "activate" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmActivate}
                className="w-full rounded-full bg-navy px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-white hover:bg-navy/90 disabled:opacity-40"
              >
                {busy ? "Saving…" : `Activate ${town.name} flag (Phase 0 only)`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="w-full rounded-full border border-charcoal/20 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 hover:border-charcoal/35 hover:text-navy disabled:opacity-40"
              >
                Cancel — do not activate yet
              </button>
            </>
          ) : null}
          {mode === "deactivate" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmDeactivate}
                className="w-full rounded-full border border-coral/40 bg-coral/10 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-coral hover:bg-coral/15 disabled:opacity-40"
              >
                {busy ? "Saving…" : `Deactivate ${town.name}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="w-full rounded-full border border-charcoal/20 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 hover:border-charcoal/35 hover:text-navy disabled:opacity-40"
              >
                Keep active
              </button>
            </>
          ) : null}
          {mode === "review" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="w-full rounded-full border border-charcoal/20 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-navy hover:bg-cream disabled:opacity-40"
            >
              Done
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
