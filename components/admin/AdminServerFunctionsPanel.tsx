import Link from "next/link";
import { ADMIN_API_ROUTE_GROUPS } from "@/lib/admin-nav";

/** Web server tab — API routes only (Netlify crons live under Syncs overview). */
export default function AdminServerFunctionsPanel() {
  return (
    <div
      id="admin-api-routes"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">API routes</p>
        <p className="mt-1 text-sm text-charcoal/65">
          Next.js route handlers under{" "}
          <code className="font-mono text-[11px] text-navy">app/api/</code>. GET links open a live
          response in a new tab. Scheduled sync workers are documented on the{" "}
          <Link href="/admin?tab=syncs" className="text-navy hover:underline">
            Syncs overview
          </Link>{" "}
          tab.
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
  );
}
