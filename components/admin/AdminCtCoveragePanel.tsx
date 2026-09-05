"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLocationEstimateOverlayPanel from "@/components/admin/AdminLocationEstimateOverlayPanel";
import CtCountyMiniMap from "@/components/admin/CtCountyMiniMap";
import CtCoverageTownsMap from "@/components/admin/CtCoverageTownsMap";
import AdminTownActivationPlaybookPanel, {
  type TownActivationPlaybookMode,
  type TownActivationPlaybookTarget,
} from "@/components/admin/AdminTownActivationPlaybookPanel";

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

type PlaybookState = {
  town: TownActivationPlaybookTarget;
  mode: TownActivationPlaybookMode;
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
  const [playbook, setPlaybook] = useState<PlaybookState | null>(null);

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

  const activeTownNames = useMemo(
    () =>
      counties.flatMap((c) =>
        c.towns.filter((t) => t.active).map((t) => t.name),
      ),
    [counties],
  );

  const toggleCollapsed = (countyId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(countyId)) next.delete(countyId);
      else next.add(countyId);
      return next;
    });
  };

  const openPlaybook = (
    county: CountyRow,
    town: TownRow,
    mode: TownActivationPlaybookMode,
  ) => {
    setPlaybook({
      mode,
      town: {
        id: town.id,
        name: town.name,
        countyName: county.name,
        active: town.active,
        mlsCityCode: town.mlsCityCode,
      },
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
      setPlaybook(null);
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
          All Connecticut counties and municipalities. Checking Activate opens
          the{" "}
          <span className="text-navy/80">canonical town-activation playbook</span>{" "}
          first — Phase 0 flips the Postgres flag and the public town list
          (copy, pills, Market Pulse). RETS incremental is still later. The large map is the same street tiles as
          Intelligence and showcase (OSM via{" "}
          <span className="font-mono text-[11px]">/api/map/tile</span>) with the
          same TIGER ZCTA rings on top. County thumbnails are TIGER county
          outlines — same Census family, different layer. Click a town to zoom
          and paint ¼-mile coastal squares; click a painted square again to
          erase it. Drag the town-center dot to relocate it, or drag the rim /
          use + − to change its radius. That disk overrides any square it covers.
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

      {!loading && counties.length > 0 ? (
        <div className="space-y-3 border-b border-charcoal/[0.08] px-5 py-4 sm:px-6">
          <AdminLocationEstimateOverlayPanel />
          <CtCoverageTownsMap activeTownNames={activeTownNames} />
        </div>
      ) : null}

      <div className="divide-y divide-charcoal/[0.06]">
        {counties.map((county) => {
          const isCollapsed = collapsed.has(county.id);
          return (
            <section key={county.id} className="px-5 sm:px-6 py-3">
              <button
                type="button"
                onClick={() => toggleCollapsed(county.id)}
                className="flex w-full items-center gap-3 text-left"
                aria-expanded={!isCollapsed}
              >
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-charcoal/15 bg-cream font-mono text-sm text-navy"
                  aria-hidden
                >
                  {isCollapsed ? "+" : "−"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-navy">
                    {county.name} County
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-charcoal/45">
                    {county.activeCount}/{county.townCount} active
                  </span>
                </span>
                <CtCountyMiniMap
                  countyId={county.id}
                  enabled={county.activeCount > 0}
                  className="h-12 w-[5.25rem] rounded border border-charcoal/20 bg-white sm:h-14 sm:w-[6.25rem]"
                />
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
                          onChange={(e) => {
                            // Controlled: stay unchecked/checked until playbook confirms.
                            if (e.target.checked) {
                              openPlaybook(county, town, "activate");
                            } else {
                              openPlaybook(county, town, "deactivate");
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-charcoal/30 text-navy focus:ring-navy/40 disabled:opacity-40"
                          aria-label={`Activate ${town.name} — opens playbook first`}
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
                      <button
                        type="button"
                        onClick={() => openPlaybook(county, town, "review")}
                        className="shrink-0 font-mono text-[9px] tracking-[0.1em] uppercase text-gold/80 hover:text-gold underline underline-offset-2"
                        title={`Open activation playbook for ${town.name}`}
                      >
                        Playbook
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      {playbook ? (
        <AdminTownActivationPlaybookPanel
          town={playbook.town}
          mode={playbook.mode}
          busy={savingId === playbook.town.id}
          onClose={() => {
            if (savingId) return;
            setPlaybook(null);
          }}
          onConfirmActivate={() => {
            void setTownActive(playbook.town.id, true);
          }}
          onConfirmDeactivate={() => {
            void setTownActive(playbook.town.id, false);
          }}
        />
      ) : null}
    </div>
  );
}
