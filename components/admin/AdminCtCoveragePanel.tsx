"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TownRow = {
  id: string;
  name: string;
  active: boolean;
  mlsCityCode: string | null;
};

type CountyRow = {
  id: string;
  name: string;
  towns: TownRow[];
  activeCount: number;
  townCount: number;
};

type CoveragePayload = {
  counties: CountyRow[];
  activeTowns?: string[];
  activeCount?: number;
  townCount?: number;
  note?: string;
  error?: string;
};

export default function AdminCtCoveragePanel() {
  const [counties, setCounties] = useState<CountyRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Collapsed county ids — default: collapse counties with zero active towns. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [initializedCollapse, setInitializedCollapse] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ct-coverage", { cache: "no-store" });
      const body = (await res.json()) as CoveragePayload;
      if (!res.ok) {
        setError(body.error ?? "Failed to load coverage");
        setCounties([]);
        return;
      }
      setCounties(body.counties ?? []);
      setNote(body.note ?? null);
      if (!initializedCollapse) {
        setCollapsed(
          new Set(
            (body.counties ?? [])
              .filter((c) => c.activeCount === 0)
              .map((c) => c.id),
          ),
        );
        setInitializedCollapse(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    } finally {
      setLoading(false);
    }
  }, [initializedCollapse]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const townCount = counties.reduce((sum, c) => sum + c.townCount, 0);
    const activeCount = counties.reduce((sum, c) => sum + c.activeCount, 0);
    return { townCount, activeCount };
  }, [counties]);

  const toggleCollapsed = (countyId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(countyId)) next.delete(countyId);
      else next.add(countyId);
      return next;
    });
  };

  const setTownActive = async (townId: string, active: boolean) => {
    setSavingId(townId);
    setError(null);
    const prev = counties;
    setCounties((cur) =>
      cur.map((c) => ({
        ...c,
        towns: c.towns.map((t) =>
          t.id === townId ? { ...t, active } : t,
        ),
        activeCount: c.towns.reduce(
          (sum, t) => sum + (t.id === townId ? (active ? 1 : 0) : t.active ? 1 : 0),
          0,
        ),
      })),
    );
    try {
      const res = await fetch("/api/admin/ct-coverage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ townId, active }),
      });
      const body = (await res.json()) as CoveragePayload & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setCounties(prev);
        setError(body.error ?? "Save failed");
        return;
      }
      if (body.counties) setCounties(body.counties);
      setNote(body.note ?? null);
    } catch (err) {
      setCounties(prev);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div
      id="admin-ct-coverage"
      className="h-full scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          CT coverage
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          All Connecticut counties and municipalities. Activate a town for
          future site-wide coverage —{" "}
          <span className="text-navy/80">
            not wired into public pages or RETS yet
          </span>
          . Today&rsquo;s seven TMRE towns start enabled.
        </p>
        <p className="mt-2 font-mono text-[10px] tracking-wide text-charcoal/50">
          {loading
            ? "Loading…"
            : `${totals.activeCount} active · ${totals.townCount} towns · ${counties.length} counties`}
        </p>
        {note ? (
          <p className="mt-2 font-mono text-[10px] leading-snug text-charcoal/45 max-w-3xl">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 font-mono text-[10px] text-coral">{error}</p>
        ) : null}
      </div>

      <div className="divide-y divide-charcoal/[0.06]">
        {counties.map((county) => {
          const isCollapsed = collapsed.has(county.id);
          return (
            <section key={county.id} className="px-5 sm:px-6 py-3">
              <button
                type="button"
                onClick={() => toggleCollapsed(county.id)}
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={!isCollapsed}
              >
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-charcoal/15 bg-cream font-mono text-sm text-navy"
                  aria-hidden
                >
                  {isCollapsed ? "+" : "−"}
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-navy">
                  {county.name} County
                </span>
                <span className="font-mono text-[10px] text-charcoal/45">
                  {county.activeCount}/{county.townCount} active
                </span>
              </button>

              {!isCollapsed ? (
                <ul className="mt-3 ml-8 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {county.towns.map((town) => (
                    <li
                      key={town.id}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={town.active}
                          disabled={savingId === town.id || loading}
                          onChange={(e) =>
                            void setTownActive(town.id, e.target.checked)
                          }
                          className="h-3.5 w-3.5 rounded border-charcoal/30 text-navy focus:ring-navy/40 disabled:opacity-40"
                          aria-label={`Activate ${town.name}`}
                        />
                        <span
                          className={`text-sm truncate ${
                            town.active ? "text-navy font-medium" : "text-slate"
                          }`}
                        >
                          {town.name}
                        </span>
                      </label>
                      {town.mlsCityCode ? (
                        <span className="font-mono text-[9px] text-charcoal/35 shrink-0">
                          MLS {town.mlsCityCode}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
