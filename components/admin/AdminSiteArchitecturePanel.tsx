/**
 * Visual-only site topology for Admin. Not interactive beyond hover titles.
 */

import { SITE_ARCH_NODES } from "@/lib/site-architecture";

const NODE = {
  client: {
    fill: "#0B1C2C",
    stroke: "#C8A951",
    text: "#F7F4EE",
    sub: "rgba(247,244,238,0.65)",
  },
  edge: {
    fill: "#F7F4EE",
    stroke: "#8A7A4A",
    text: "#0B1C2C",
    sub: "rgba(11,28,44,0.55)",
  },
  core: {
    fill: "#12283A",
    stroke: "#C8A951",
    text: "#F7F4EE",
    sub: "rgba(247,244,238,0.62)",
  },
  optional: {
    fill: "#FFFFFF",
    stroke: "rgba(11,28,44,0.22)",
    text: "#0B1C2C",
    sub: "rgba(11,28,44,0.5)",
  },
} as const;

type ArchBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  role: string;
  kind: keyof typeof NODE;
  title?: string;
};

function Box({
  x,
  y,
  w,
  h,
  label,
  role,
  kind,
  title,
}: ArchBox) {
  const c = NODE[kind];
  return (
    <g>
      <title>{title ?? `${label} — ${role}`}</title>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={kind === "optional" ? 1 : 1.5}
      />
      <text
        x={x + w / 2}
        y={y + 22}
        textAnchor="middle"
        fill={c.text}
        style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em" }}
      >
        {label.toUpperCase()}
      </text>
      <text
        x={x + w / 2}
        y={y + 40}
        textAnchor="middle"
        fill={c.sub}
        style={{ fontSize: 10, fontFamily: "system-ui, sans-serif" }}
      >
        {role}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  dashed?: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgba(11,28,44,0.28)"
        strokeWidth={1.25}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd="url(#arch-arrow)"
      />
      {label ? (
        <text
          x={mx}
          y={my - 5}
          textAnchor="middle"
          fill="rgba(11,28,44,0.45)"
          style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function LaneLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fill="rgba(11,28,44,0.35)"
      style={{
        fontSize: 10,
        fontFamily: "ui-monospace, monospace",
        letterSpacing: "0.16em",
      }}
    >
      {text}
    </text>
  );
}

export default function AdminSiteArchitecturePanel() {
  // Canvas: 980 × 720 — layered topology, visual only.
  const W = 980;
  const H = 720;

  return (
    <div id="admin-site-architecture" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Site architecture
          </p>
          <p className="mt-1 max-w-3xl text-sm text-charcoal/65">
            Visual map of how the TMRE app talks to hosts, data stores, MLS, and
            notify services. Diagram only — not a live health probe.
          </p>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-navy ring-1 ring-gold" />
              Core
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-cream ring-1 ring-charcoal/30" />
              Edge / DNS
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-white ring-1 ring-charcoal/20" />
              Optional
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08] bg-gradient-to-b from-cream/50 to-white">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mx-auto h-auto w-full min-w-[44rem] max-w-[980px]"
              role="img"
              aria-label="TMRE site architecture diagram"
            >
              <defs>
                <marker
                  id="arch-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(11,28,44,0.35)" />
                </marker>
              </defs>

              {/* Soft lane bands */}
              <rect x={20} y={36} width={940} height={88} rx={14} fill="rgba(11,28,44,0.03)" />
              <rect x={20} y={140} width={940} height={88} rx={14} fill="rgba(200,169,81,0.06)" />
              <rect x={20} y={244} width={940} height={100} rx={14} fill="rgba(11,28,44,0.04)" />
              <rect x={20} y={360} width={940} height={160} rx={14} fill="rgba(11,28,44,0.025)" />
              <rect x={20} y={536} width={940} height={160} rx={14} fill="rgba(200,169,81,0.05)" />

              <LaneLabel x={36} y={58} text="CLIENTS" />
              <LaneLabel x={36} y={162} text="EDGE · DOMAIN / CDN" />
              <LaneLabel x={36} y={266} text="APP HOST" />
              <LaneLabel x={36} y={382} text="DATA · MLS · PHOTOS" />
              <LaneLabel x={36} y={558} text="NOTIFY · GEO · ENRICHMENT" />

              {/* Clients */}
              <Box
                id="visitors"
                x={390}
                y={56}
                w={200}
                h={52}
                label="Visitors"
                role="Browsers · public site"
                kind="client"
              />

              {/* Edge */}
              <Box
                id="godaddy"
                x={120}
                y={160}
                w={220}
                h={52}
                label="GoDaddy"
                role="Registrar / DNS (typical)"
                kind="edge"
                title="GoDaddy — domain registrar / DNS. Not referenced in app code; include if this is where the domain is registered."
              />
              <Box
                id="cloudflare-edge"
                x={400}
                y={160}
                w={260}
                h={52}
                label="Cloudflare"
                role="DNS / CDN proxy (if enabled)"
                kind="edge"
                title="Cloudflare edge — DNS/CDN if nameservers point here. Photo storage uses R2 separately (below)."
              />
              <Box
                id="direct"
                x={720}
                y={160}
                w={200}
                h={52}
                label="Direct DNS"
                role="Apex → Netlify"
                kind="optional"
                title="Some setups point the domain straight at Netlify without a CDN proxy."
              />

              {/* App host + optional AWS alarm */}
              <Box
                id="netlify"
                x={120}
                y={264}
                w={360}
                h={60}
                label="Netlify"
                role="Next.js · functions · crons · Blobs"
                kind="core"
                title="Netlify — Next.js site, serverless API routes, scheduled sync jobs, Netlify Blobs. Thin crons skip jobs whose Configure Scheduler is EventBridge."
              />
              <Box
                id="eventbridge"
                x={520}
                y={264}
                w={360}
                h={60}
                label="AWS EventBridge"
                role="Scheduler · optional alarm clock"
                kind="optional"
                title="AWS EventBridge Scheduler — side-by-side with Netlify cron. Per-job radio on Admin → Syncs → Configure. HTTP POST eventbridge-sync-ingress with SYNC_CRON_SECRET + { job }."
              />

              {/* Data plane */}
              <Box
                id="neon"
                x={48}
                y={392}
                w={220}
                h={72}
                label="Neon"
                role="Postgres · Netlify + local"
                kind="core"
                title="Neon Postgres — shared by Netlify + local when DATABASE_URL points here. Listings, sync_meta, stats_cache, visitors, alerts."
              />
              <Box
                id="rets"
                x={280}
                y={400}
                w={200}
                h={56}
                label="SmartMLS RETS"
                role="MLS listings feed"
                kind="core"
              />
              <Box
                id="r2"
                x={512}
                y={400}
                w={200}
                h={56}
                label="Cloudflare R2"
                role="Listing photo bytes"
                kind="core"
              />
              <Box
                id="blobs"
                x={744}
                y={400}
                w={190}
                h={56}
                label="Netlify Blobs"
                role="Legacy photo checkpoint"
                kind="optional"
              />

              {/* Notify + enrichment */}
              <Box
                id="resend"
                x={48}
                y={576}
                w={150}
                h={56}
                label="Resend"
                role="Transactional email"
                kind="core"
              />
              <Box
                id="twilio"
                x={216}
                y={576}
                w={140}
                h={56}
                label="Twilio"
                role="Deploy SMS"
                kind="optional"
              />
              <Box
                id="census"
                x={374}
                y={576}
                w={150}
                h={56}
                label="Census"
                role="TIGER zip rings"
                kind="core"
              />
              <Box
                id="osm"
                x={542}
                y={576}
                w={130}
                h={56}
                label="OSM"
                role="Map tiles"
                kind="core"
              />
              <Box
                id="ipapi"
                x={690}
                y={576}
                w={120}
                h={56}
                label="ipapi"
                role="Visitor geo"
                kind="optional"
              />
              <Box
                id="more"
                x={828}
                y={576}
                w={120}
                h={56}
                label="+ more"
                role="Vision · GS · AI"
                kind="optional"
                title="Vision Appraisal (assessor), GreatSchools (optional), OpenAI (optional finish/descriptor)."
              />

              {/* Flows */}
              <Arrow x1={490} y1={108} x2={230} y2={160} label="DNS" dashed />
              <Arrow x1={490} y1={108} x2={530} y2={160} dashed />
              <Arrow x1={490} y1={108} x2={820} y2={160} dashed />
              <Arrow x1={230} y1={212} x2={280} y2={264} dashed />
              <Arrow x1={530} y1={212} x2={300} y2={264} label="HTTPS" />
              <Arrow x1={820} y1={212} x2={340} y2={264} dashed />

              <Arrow
                x1={700}
                y1={294}
                x2={480}
                y2={294}
                label="ingress"
                dashed
              />

              <Arrow x1={240} y1={324} x2={158} y2={392} label="SQL" />
              <Arrow x1={300} y1={324} x2={380} y2={400} label="sync" />
              <Arrow x1={360} y1={324} x2={612} y2={400} label="photos" />
              <Arrow x1={400} y1={324} x2={830} y2={400} dashed />

              <Arrow x1={220} y1={324} x2={123} y2={576} />
              <Arrow x1={260} y1={324} x2={286} y2={576} dashed />
              <Arrow x1={300} y1={324} x2={449} y2={576} />
              <Arrow x1={340} y1={324} x2={607} y2={576} />
              <Arrow x1={380} y1={324} x2={750} y2={576} dashed />
              <Arrow x1={420} y1={324} x2={888} y2={576} dashed />
            </svg>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NoteCard
              title="In your list"
              body="Netlify (host + functions + crons), Neon (Postgres — shared by Netlify + local when DATABASE_URL points here), Cloudflare R2 (photos), Resend (email). GoDaddy / Cloudflare DNS are edge pieces outside the repo — shown dashed if you use them for the domain."
            />
            <NoteCard
              title="Also in production paths"
              body="SmartMLS RETS (MLS), Census TIGERweb (zip rings), OpenStreetMap tiles, Netlify Blobs (legacy photo/progress), Twilio (deploy SMS when enabled)."
            />
            <NoteCard
              title="Optional / config"
              body="AWS EventBridge Scheduler (side-by-side sync alarm — Configure Scheduler radio; HTTP to eventbridge-sync-ingress). ipapi.co, Vision Appraisal, GreatSchools, OpenAI. Social profile slots are stored in Admin but posting APIs are not wired."
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-charcoal/[0.08]">
            <div className="border-b border-charcoal/[0.06] bg-cream/40 px-4 py-2.5">
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
                Component roster
              </p>
            </div>
            <ul className="divide-y divide-charcoal/[0.06]">
              {SITE_ARCH_NODES.map((node) => (
                <li
                  key={node.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy min-w-[8.5rem]">
                    {node.label}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40">
                    {node.kind}
                  </span>
                  <span className="text-charcoal/60">{node.role}</span>
                  {node.note ? (
                    <span className="basis-full text-xs text-charcoal/45 pl-0 sm:pl-[8.5rem]">
                      {node.note}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-charcoal/65">{body}</p>
    </div>
  );
}
