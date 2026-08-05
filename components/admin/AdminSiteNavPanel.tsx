"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_SITE_NAV,
  moveItem,
  normalizeSiteNav,
  type SiteNavConfig,
  type SiteNavExploreGroup,
  type SiteNavTopItem,
} from "@/lib/site-nav-shared";

function RowChrome({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
      {children}
    </div>
  );
}

function MoveButtons({
  onUp,
  onDown,
  disableUp,
  disableDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  return (
    <span className="inline-flex gap-0.5">
      <button
        type="button"
        aria-label="Move up"
        disabled={disableUp}
        onClick={onUp}
        className="font-mono text-[10px] rounded px-1.5 py-1 border border-charcoal/15 text-navy disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={disableDown}
        onClick={onDown}
        className="font-mono text-[10px] rounded px-1.5 py-1 border border-charcoal/15 text-navy disabled:opacity-30"
      >
        ▼
      </button>
    </span>
  );
}

export default function AdminSiteNavPanel({
  initial,
}: {
  initial?: SiteNavConfig;
}) {
  const [config, setConfig] = useState<SiteNavConfig>(
    () => initial ?? structuredClone(DEFAULT_SITE_NAV),
  );
  const [saved, setSaved] = useState<SiteNavConfig>(
    () => initial ?? structuredClone(DEFAULT_SITE_NAV),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/site-nav", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { config?: SiteNavConfig } | null) => {
        if (cancelled || !body?.config) return;
        const next = normalizeSiteNav(body.config);
        setConfig(next);
        setSaved(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site-nav", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        config?: SiteNavConfig;
        error?: string;
      };
      if (!res.ok || !body.config) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      const next = normalizeSiteNav(body.config);
      setConfig(next);
      setSaved(next);
      setMessage("Saved — public header updates on next page load");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setConfig(structuredClone(DEFAULT_SITE_NAV));
    setMessage("Reset to defaults (not saved yet)");
  };

  const patchTop = (index: number, patch: Partial<SiteNavTopItem>) => {
    setConfig((prev) => {
      const topLevel = prev.topLevel.map((item, i) => {
        if (i !== index) return item;
        if (item.kind === "explore") {
          return {
            ...item,
            label:
              typeof patch.label === "string" ? patch.label : item.label,
            visible:
              typeof patch.visible === "boolean" ? patch.visible : item.visible,
          };
        }
        return {
          ...item,
          label: typeof patch.label === "string" ? patch.label : item.label,
          visible:
            typeof patch.visible === "boolean" ? patch.visible : item.visible,
        };
      });
      return { ...prev, topLevel };
    });
  };

  const patchGroup = (
    gi: number,
    patch: Partial<Pick<SiteNavExploreGroup, "title" | "visible">>,
  ) => {
    setConfig((prev) => {
      const exploreGroups = prev.exploreGroups.map((g, i) =>
        i === gi ? { ...g, ...patch } : g,
      );
      return { ...prev, exploreGroups };
    });
  };

  const patchGroupLink = (
    gi: number,
    li: number,
    patch: { label?: string; visible?: boolean },
  ) => {
    setConfig((prev) => {
      const exploreGroups = prev.exploreGroups.map((g, i) => {
        if (i !== gi) return g;
        const links = g.links.map((l, j) =>
          j === li ? { ...l, ...patch } : l,
        );
        return { ...g, links };
      });
      return { ...prev, exploreGroups };
    });
  };

  return (
    <div
      id="admin-site-nav"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Site menu
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Organize the public header: top-level links, Explore dropdown groups,
          labels, order, and show/hide. Hrefs stay fixed to existing site pages
          — no redeploy required after save.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-8">
        <section className="space-y-3">
          <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Top-level menu
          </h3>
          {config.topLevel.map((item, i) => (
            <RowChrome key={item.id}>
              <MoveButtons
                disableUp={i === 0}
                disableDown={i === config.topLevel.length - 1}
                onUp={() =>
                  setConfig((p) => ({
                    ...p,
                    topLevel: moveItem(p.topLevel, i, -1),
                  }))
                }
                onDown={() =>
                  setConfig((p) => ({
                    ...p,
                    topLevel: moveItem(p.topLevel, i, 1),
                  }))
                }
              />
              <label className="inline-flex items-center gap-1.5 font-mono text-[10px] text-charcoal/55">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(e) =>
                    patchTop(i, { visible: e.target.checked })
                  }
                />
                Show
              </label>
              <input
                type="text"
                value={item.label}
                maxLength={48}
                onChange={(e) => patchTop(i, { label: e.target.value })}
                className="min-w-[10rem] flex-1 rounded border border-charcoal/15 px-2 py-1.5 text-sm text-navy"
              />
              <span className="font-mono text-[10px] text-charcoal/40">
                {item.kind === "explore" ? "Explore menu" : item.href}
              </span>
            </RowChrome>
          ))}
        </section>

        <section className="space-y-4">
          <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Explore groups
          </h3>
          {config.exploreGroups.map((group, gi) => (
            <div
              key={group.id}
              className="rounded-xl border border-charcoal/[0.08] p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MoveButtons
                  disableUp={gi === 0}
                  disableDown={gi === config.exploreGroups.length - 1}
                  onUp={() =>
                    setConfig((p) => ({
                      ...p,
                      exploreGroups: moveItem(p.exploreGroups, gi, -1),
                    }))
                  }
                  onDown={() =>
                    setConfig((p) => ({
                      ...p,
                      exploreGroups: moveItem(p.exploreGroups, gi, 1),
                    }))
                  }
                />
                <label className="inline-flex items-center gap-1.5 font-mono text-[10px] text-charcoal/55">
                  <input
                    type="checkbox"
                    checked={group.visible}
                    onChange={(e) =>
                      patchGroup(gi, { visible: e.target.checked })
                    }
                  />
                  Show group
                </label>
                <input
                  type="text"
                  value={group.title}
                  maxLength={40}
                  onChange={(e) => patchGroup(gi, { title: e.target.value })}
                  className="min-w-[8rem] flex-1 rounded border border-charcoal/15 px-2 py-1.5 text-sm font-medium text-navy"
                  aria-label="Group title"
                />
              </div>
              <div className="space-y-1.5 pl-1">
                {group.links.map((link, li) => (
                  <RowChrome key={link.id}>
                    <MoveButtons
                      disableUp={li === 0}
                      disableDown={li === group.links.length - 1}
                      onUp={() =>
                        setConfig((p) => {
                          const exploreGroups = p.exploreGroups.map((g, i) =>
                            i === gi
                              ? { ...g, links: moveItem(g.links, li, -1) }
                              : g,
                          );
                          return { ...p, exploreGroups };
                        })
                      }
                      onDown={() =>
                        setConfig((p) => {
                          const exploreGroups = p.exploreGroups.map((g, i) =>
                            i === gi
                              ? { ...g, links: moveItem(g.links, li, 1) }
                              : g,
                          );
                          return { ...p, exploreGroups };
                        })
                      }
                    />
                    <label className="inline-flex items-center gap-1.5 font-mono text-[10px] text-charcoal/55">
                      <input
                        type="checkbox"
                        checked={link.visible}
                        onChange={(e) =>
                          patchGroupLink(gi, li, {
                            visible: e.target.checked,
                          })
                        }
                      />
                      Show
                    </label>
                    <input
                      type="text"
                      value={link.label}
                      maxLength={48}
                      onChange={(e) =>
                        patchGroupLink(gi, li, { label: e.target.value })
                      }
                      className="min-w-[8rem] flex-1 rounded border border-charcoal/15 px-2 py-1.5 text-sm text-navy"
                    />
                    <span className="font-mono text-[10px] text-charcoal/40">
                      {link.href}
                    </span>
                  </RowChrome>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save menu"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-charcoal/20 text-charcoal/70 hover:bg-cream/50 transition-colors"
          >
            Reset to defaults
          </button>
          {message ? (
            <p className="font-mono text-[11px] text-charcoal/55">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
