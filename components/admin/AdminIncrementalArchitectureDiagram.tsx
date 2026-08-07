import { describeIncrementalSyncArchitecture } from "@/lib/incremental-sync-architecture";

const LANE_STYLES: Record<
  "admin" | "railway" | "cron" | "worker" | "data" | "public",
  { label: string; border: string; bg: string }
> = {
  admin: {
    label: "Admin",
    border: "border-navy/25",
    bg: "bg-navy/[0.04]",
  },
  railway: {
    label: "Lane 1 — Railway mls-sync (RETS → Neon)",
    border: "border-coral/35",
    bg: "bg-coral/[0.07]",
  },
  cron: {
    label: "Legacy schedule (Netlify / EventBridge)",
    border: "border-gold/40",
    bg: "bg-gold/[0.08]",
  },
  worker: {
    label: "Lane 3 — Netlify warm / legacy RETS worker",
    border: "border-sage/35",
    bg: "bg-sage/[0.08]",
  },
  data: {
    label: "Lane 2 — Neon Postgres (handoff / truth)",
    border: "border-sky/35",
    bg: "bg-sky/[0.08]",
  },
  public: {
    label: "Public site",
    border: "border-charcoal/20",
    bg: "bg-cream/80",
  },
};

/**
 * Syncs → Dashboard diagram: Railway lean pull, Neon handoff, Netlify warm.
 */
export default function AdminIncrementalArchitectureDiagram() {
  const arch = describeIncrementalSyncArchitecture();
  const byLane = {
    admin: arch.nodes.filter((n) => n.lane === "admin"),
    railway: arch.nodes.filter((n) => n.lane === "railway"),
    cron: arch.nodes.filter((n) => n.lane === "cron"),
    worker: arch.nodes.filter((n) => n.lane === "worker"),
    data: arch.nodes.filter((n) => n.lane === "data"),
    public: arch.nodes.filter((n) => n.lane === "public"),
  } as const;

  return (
    <div
      id="admin-incremental-architecture"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {arch.title}
        </p>
        <p className="mt-1 max-w-3xl text-sm text-slate">{arch.subtitle}</p>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        {/* Ownership lanes 1 / 2 / 3 */}
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
            Ownership split (who does what)
          </p>
          <ul className="grid gap-2 lg:grid-cols-3">
            {arch.ownership.map((lane) => (
              <li
                key={lane.id}
                className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-3.5 py-3"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                  {lane.title}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.08em] uppercase text-gold">
                  {lane.host}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate">
                  <span className="font-medium text-navy/80">Owns: </span>
                  {lane.owns}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate/80">
                  <span className="font-medium text-coral/90">Does not: </span>
                  {lane.doesNot}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Dashboard clocks */}
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
            Dashboard clocks (Incremental row)
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {arch.clocks.map((clock) => (
              <li
                key={clock.id}
                className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                    {clock.label}
                  </p>
                  <code className="font-mono text-[9px] text-charcoal/40">
                    {clock.metaKey}
                  </code>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate">
                  {clock.meaning}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Flow lanes */}
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
            Who does what
          </p>
          <div className="space-y-3">
            {(
              [
                "admin",
                "railway",
                "data",
                "worker",
                "cron",
                "public",
              ] as const
            ).map((lane) => {
              const style = LANE_STYLES[lane];
              const nodes = byLane[lane];
              if (nodes.length === 0) return null;
              return (
                <div
                  key={lane}
                  className={`rounded-xl border ${style.border} ${style.bg} px-3.5 py-3`}
                >
                  <p className="mb-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/50">
                    {style.label}
                  </p>
                  <ul className="space-y-2.5">
                    {nodes.map((node) => (
                      <li key={node.id}>
                        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy">
                          {node.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate">
                          {node.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Edges as a simple flow list */}
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
            Call path
          </p>
          <ol className="space-y-1.5 border-l-2 border-gold/40 pl-3">
            {arch.edges.map((edge) => {
              const from = arch.nodes.find((n) => n.id === edge.from);
              const to = arch.nodes.find((n) => n.id === edge.to);
              return (
                <li
                  key={`${edge.from}-${edge.to}-${edge.label}`}
                  className="font-mono text-[11px] leading-snug text-navy/85"
                >
                  <span className="text-charcoal/45">
                    {from?.title ?? edge.from}
                  </span>
                  <span className="mx-1.5 text-gold">→</span>
                  <span>{to?.title ?? edge.to}</span>
                  <span className="mt-0.5 block text-[10px] font-sans normal-case tracking-normal text-slate">
                    {edge.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <ul className="space-y-1.5 rounded-xl border border-coral/20 bg-coral/[0.06] px-3.5 py-3">
          {arch.notes.map((note) => (
            <li key={note} className="text-xs leading-relaxed text-slate">
              {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
