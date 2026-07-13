import type {
  StartupFlowLane,
  StartupFlowStep,
  StartupStepStatus,
} from "@/lib/startup-process";

const STATUS_STYLES: Record<StartupStepStatus, { dot: string; chip: string }> = {
  active: {
    dot: "bg-sage",
    chip: "bg-sage/10 text-sage border-sage/25",
  },
  scheduled: {
    dot: "bg-gold",
    chip: "bg-gold/10 text-navy border-gold/30",
  },
  skipped: {
    dot: "bg-charcoal/25",
    chip: "bg-charcoal/[0.05] text-charcoal/45 border-charcoal/10",
  },
  info: {
    dot: "bg-sky",
    chip: "bg-sky/10 text-sky border-sky/25",
  },
};

function StepNode({ step, isLast }: { step: StartupFlowStep; isLast: boolean }) {
  const style = STATUS_STYLES[step.status];
  return (
    <li className="relative flex gap-4">
      <div className="flex flex-col items-center shrink-0 w-4">
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ${style.dot}`} />
        {!isLast ? (
          <span className="mt-1 w-px flex-1 min-h-[1.25rem] bg-charcoal/15" aria-hidden />
        ) : null}
      </div>
      <div className={`min-w-0 pb-5 ${isLast ? "pb-0" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
            {step.title}
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase ${style.chip}`}
          >
            {step.statusLabel}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-charcoal/40">
            {step.timing}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate leading-relaxed">{step.detail}</p>
      </div>
    </li>
  );
}

function LaneCard({ lane }: { lane: StartupFlowLane }) {
  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {lane.title}
        </p>
        <p className="mt-1 text-sm text-slate">{lane.subtitle}</p>
      </div>
      <ul className="px-5 sm:px-6 py-5">
        {lane.steps.map((step, index) => (
          <StepNode
            key={step.id}
            step={step}
            isLast={index === lane.steps.length - 1}
          />
        ))}
      </ul>
    </div>
  );
}

export default function AdminStartupDiagram({
  lanes,
  context,
}: {
  lanes: StartupFlowLane[];
  context: {
    runtime: string;
    retsConfigured: boolean;
    netlify: boolean;
    nodeEnv: string;
  };
}) {
  return (
    <div className="mt-6 space-y-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
          Startup process
        </p>
        <p className="text-sm text-slate max-w-3xl">
          What happens after this Node process boots — full reload, incremental Latest
          sync, weekly Mon 5am rebuild, and cache refresh. Status chips reflect the current
          environment.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50">
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            runtime {context.runtime || "nodejs"}
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            {context.nodeEnv}
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            RETS {context.retsConfigured ? "configured" : "missing"}
          </span>
          <span className="rounded-full border border-charcoal/10 bg-cream/60 px-2.5 py-1">
            {context.netlify ? "Netlify" : "local / long-lived"}
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
