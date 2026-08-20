import type {
  StatsCacheArchitecture,
  StatsCacheLane,
  StatsCacheStage,
  StatsCacheStageStatus,
} from "@/lib/stats-cache-architecture";

const STATUS_STYLES: Record<
  StatsCacheStageStatus,
  { dot: string; chip: string }
> = {
  live: {
    dot: "bg-sage",
    chip: "bg-sage/10 text-sage border-sage/25",
  },
  guard: {
    dot: "bg-sky",
    chip: "bg-sky/10 text-sky border-sky/25",
  },
  fallback: {
    dot: "bg-gold",
    chip: "bg-gold/10 text-navy border-gold/30",
  },
  retired: {
    dot: "bg-charcoal/25",
    chip: "bg-charcoal/[0.05] text-charcoal/45 border-charcoal/10",
  },
};

function StageNode({
  stage,
  isLast,
}: {
  stage: StatsCacheStage;
  isLast: boolean;
}) {
  const style = STATUS_STYLES[stage.status];
  return (
    <li className="relative flex gap-4">
      <div className="flex flex-col items-center shrink-0 w-4">
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ${style.dot}`} />
        {!isLast ? (
          <span
            className="mt-1 w-px flex-1 min-h-[1.25rem] bg-charcoal/15"
            aria-hidden
          />
        ) : null}
      </div>
      <div className={`min-w-0 pb-5 ${isLast ? "pb-0" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <p
            className={`font-mono text-[11px] tracking-[0.12em] uppercase ${
              stage.status === "retired" ? "text-charcoal/45 line-through" : "text-navy"
            }`}
          >
            {stage.title}
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase ${style.chip}`}
          >
            {stage.statusLabel}
          </span>
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/40">
            {stage.host}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate leading-relaxed">
          {stage.detail}
        </p>
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          {stage.source}
        </p>
      </div>
    </li>
  );
}

function LaneCard({ lane }: { lane: StatsCacheLane }) {
  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {lane.title}
        </p>
        <p className="mt-1 text-sm text-slate">{lane.subtitle}</p>
      </div>
      <ul className="px-5 sm:px-6 py-5">
        {lane.stages.map((stage, index) => (
          <StageNode
            key={stage.id}
            stage={stage}
            isLast={index === lane.stages.length - 1}
          />
        ))}
      </ul>
    </div>
  );
}

export default function AdminStatsCacheDiagram({
  architecture,
}: {
  architecture: StatsCacheArchitecture;
}) {
  const { context, lanes } = architecture;
  return (
    <div className="mt-6 space-y-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
          Stats cache rebuild path
        </p>
        <p className="text-sm text-slate max-w-3xl">
          Stats payloads rebuild when listing data actually changes, not on a
          timer. A town is marked dirty by the incremental sync, the sweep picks
          up whatever is marked, and every run leaves a record on the Stats cache
          row in Dashboard.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50">
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            {context.towns} towns
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            sweep {context.sweepMinutes}m
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            backstop {context.backstopHours}h
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            reported stale {context.reportedStaleMinutes}m
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <ol className="flex items-center gap-2 min-w-max font-mono text-[10px] tracking-[0.14em] uppercase">
          {lanes.map((lane, index) => (
            <li key={lane.id} className="flex items-center gap-2">
              <span className="rounded-full border border-charcoal/10 bg-navy text-white px-3 py-2">
                {lane.title}
              </span>
              {index < lanes.length - 1 ? (
                <span className="text-gold/80" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {lanes.map((lane) => (
          <LaneCard key={lane.id} lane={lane} />
        ))}
      </div>
    </div>
  );
}
