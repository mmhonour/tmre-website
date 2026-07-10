import Link from "next/link";
import { ADMIN_API_ROUTE_GROUPS, ADMIN_NETLIFY_FUNCTIONS } from "@/lib/admin-nav";

export default function AdminServerFunctionsPanel() {
  return (
    <div className="space-y-6">
      <div
        id="admin-netlify"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Netlify scheduled functions
          </p>
          <p className="mt-1 text-sm text-charcoal/65">
            Background workers in{" "}
            <code className="font-mono text-[11px] text-navy">netlify/functions/</code> — mirrored
            locally by{" "}
            <code className="font-mono text-[11px] text-navy">instrumentation.ts</code>.
          </p>
        </div>
        <ul className="divide-y divide-charcoal/[0.08]">
          {ADMIN_NETLIFY_FUNCTIONS.map((fn) => (
            <li key={fn.label} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                  {fn.label}
                </p>
                {fn.schedule ? (
                  <span className="font-mono text-[10px] tracking-[0.1em] text-gold">
                    {fn.schedule}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-charcoal/65">{fn.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div
        id="admin-api-routes"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">API routes</p>
          <p className="mt-1 text-sm text-charcoal/65">
            Next.js route handlers under{" "}
            <code className="font-mono text-[11px] text-navy">app/api/</code>. GET links open a live
            response in a new tab.
          </p>
        </div>
        <div className="divide-y divide-charcoal/[0.08]">
          {ADMIN_API_ROUTE_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="bg-cream/20 px-5 py-2 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50 sm:px-6">
                {group.title}
              </p>
              <ul className="divide-y divide-charcoal/[0.06]">
                {group.routes.map((route) => (
                  <li key={route.label} className="px-5 py-3 sm:px-6">
                    {route.href ? (
                      <Link
                        href={route.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <p className="font-mono text-[11px] tracking-[0.08em] text-navy group-hover:underline">
                          {route.label}
                          <span className="ml-1 text-charcoal/35">↗</span>
                        </p>
                        <p className="mt-0.5 text-sm text-charcoal/65">{route.detail}</p>
                      </Link>
                    ) : (
                      <>
                        <p className="font-mono text-[11px] tracking-[0.08em] text-navy">
                          {route.label}
                        </p>
                        <p className="mt-0.5 text-sm text-charcoal/65">{route.detail}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
