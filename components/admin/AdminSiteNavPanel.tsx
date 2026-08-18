"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createCustomExploreGroup,
  DEFAULT_SITE_NAV,
  moveItem,
  normalizeSiteNav,
  siteNavAddablePages,
  siteNavLinkForPage,
  type SiteNavConfig,
  type SiteNavExploreGroup,
  type SiteNavTopItem,
} from "@/lib/site-nav-shared";
import { findSitePage, type SitePage } from "@/lib/site-pages";

/** Add page picker — shown for the top level and for each Explore group. */
function AddPageRow({
  pages,
  onAdd,
}: {
  pages: SitePage[];
  onAdd: (page: SitePage) => void;
}) {
  const [path, setPath] = useState("");

  if (pages.length === 0) {
    return (
      <p className="font-mono text-[10px] text-charcoal/40">
        Every public page in the catalog is already in the menu.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={path}
        onChange={(e) => setPath(e.target.value)}
        aria-label="Page to add"
        className="rounded border border-charcoal/15 px-2 py-1.5 text-sm text-navy"
      >
        <option value="">Add a page…</option>
        {pages.map((page) => (
          <option key={page.path} value={page.path}>
            {page.label} · {page.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!path}
        onClick={() => {
          const page = findSitePage(path);
          if (!page) return;
          onAdd(page);
          setPath("");
        }}
        className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        + Add
      </button>
    </div>
  );
}

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

  const addablePages = siteNavAddablePages(config);

  const addTopPage = (page: SitePage) => {
    setConfig((prev) => ({
      ...prev,
      topLevel: [
        ...prev.topLevel,
        { kind: "link" as const, ...siteNavLinkForPage(page) },
      ],
    }));
  };

  const addGroupPage = (gi: number, page: SitePage) => {
    setConfig((prev) => ({
      ...prev,
      exploreGroups: prev.exploreGroups.map((g, i) =>
        i === gi ? { ...g, links: [...g.links, siteNavLinkForPage(page)] } : g,
      ),
    }));
  };

  /** Only added rows can be deleted — catalog rows are hidden with Show
   *  instead, because normalizeSiteNav re-appends anything from the catalog. */
  const removeTop = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      topLevel: prev.topLevel.filter((_, i) => i !== index),
    }));
  };

  const removeGroupLink = (gi: number, li: number) => {
    setConfig((prev) => ({
      ...prev,
      exploreGroups: prev.exploreGroups.map((g, i) =>
        i === gi ? { ...g, links: g.links.filter((_, j) => j !== li) } : g,
      ),
    }));
  };

  const addCustomGroup = () => {
    setConfig((prev) => ({
      ...prev,
      exploreGroups: [
        ...prev.exploreGroups,
        createCustomExploreGroup(prev.exploreGroups),
      ],
    }));
  };

  const removeCustomGroup = (gi: number) => {
    setConfig((prev) => ({
      ...prev,
      exploreGroups: prev.exploreGroups.filter(
        (g, i) => i !== gi || g.custom !== true,
      ),
    }));
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
          labels, order, show/hide, and adding or removing pages. Add group
          creates an empty custom column; Remove is only on those custom groups.
          Pages can be added to any group, including custom ones. Catalog
          groups (Properties, Research) hide rather than delete. The picker
          lists every stable public page that is not already in the menu. No
          redeploy required after save.
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
              {item.kind === "link" && item.custom ? (
                <button
                  type="button"
                  onClick={() => removeTop(i)}
                  className="font-mono text-[10px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border border-coral/40 text-coral hover:bg-rose-50 transition-colors"
                >
                  Remove
                </button>
              ) : null}
            </RowChrome>
          ))}
          <AddPageRow pages={addablePages} onAdd={addTopPage} />
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
                {group.custom ? (
                  <button
                    type="button"
                    onClick={() => removeCustomGroup(gi)}
                    className="font-mono text-[10px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border border-coral/40 text-coral hover:bg-rose-50 transition-colors"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {group.custom && group.links.length === 0 ? (
                <p className="font-mono text-[10px] text-charcoal/40 pl-1">
                  Empty custom column — add a page below. Hidden on the public
                  site until it has a visible page.
                </p>
              ) : null}
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
                    {link.custom ? (
                      <button
                        type="button"
                        onClick={() => removeGroupLink(gi, li)}
                        className="font-mono text-[10px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border border-coral/40 text-coral hover:bg-rose-50 transition-colors"
                      >
                        Remove
                      </button>
                    ) : null}
                  </RowChrome>
                ))}
                <AddPageRow
                  pages={addablePages}
                  onAdd={(page) => addGroupPage(gi, page)}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustomGroup}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/30 text-navy bg-cream/40 hover:bg-cream transition-colors"
          >
            + Add group
          </button>
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
