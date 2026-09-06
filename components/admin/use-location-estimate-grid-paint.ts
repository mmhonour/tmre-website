"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOCATION_ESTIMATE_GRID_CHANGED_EVENT,
  nextCellAction,
  type CoastalStripIndex,
  type ZipGridCells,
} from "@/lib/location-estimate-zip-grid-shared";

export type GridBrush = CoastalStripIndex | "erase";

/**
 * Load / paint / autosave the admin zip grid. A stroke locks to paint or
 * erase from the first square so a drag does not flicker.
 */
export function useLocationEstimateGridPaint() {
  const [cells, setCells] = useState<ZipGridCells>({});
  const [brush, setBrush] = useState<GridBrush>(0);
  const [saving, setSaving] = useState(false);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const pendingRef = useRef<{ patch: ZipGridCells; erase: string[] }>({
    patch: {},
    erase: [],
  });
  const saveTimer = useRef<number | null>(null);
  const strokeRef = useRef<GridBrush | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/location-estimate-zip-grid")
      .then((res) => (res.ok ? res.json() : { cells: {} }))
      .then((data: { cells?: ZipGridCells }) => {
        if (!cancelled && data.cells) setCells(data.cells);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback(() => {
    const { patch, erase } = pendingRef.current;
    if (Object.keys(patch).length === 0 && erase.length === 0) return;
    pendingRef.current = { patch: {}, erase: [] };
    setSaving(true);
    void fetch("/api/admin/location-estimate-zip-grid", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch, erase }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { cells?: ZipGridCells } | null) => {
        if (data?.cells) setCells(data.cells);
        window.dispatchEvent(new Event(LOCATION_ESTIMATE_GRID_CHANGED_EVENT));
      })
      .finally(() => setSaving(false));
  }, []);

  const applyAction = useCallback(
    (key: string, action: GridBrush) => {
      setCells((cur) => {
        const next = { ...cur };
        if (action === "erase") {
          delete next[key];
          pendingRef.current.erase.push(key);
          delete pendingRef.current.patch[key];
        } else {
          next[key] = action;
          pendingRef.current.patch[key] = action;
          pendingRef.current.erase = pendingRef.current.erase.filter((k) => k !== key);
        }
        return next;
      });
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => flush(), 450);
    },
    [flush],
  );

  const beginStroke = useCallback(
    (key: string) => {
      const action = nextCellAction(cellsRef.current[key], brush);
      strokeRef.current = action;
      lastKeyRef.current = key;
      applyAction(key, action);
    },
    [applyAction, brush],
  );

  const continueStroke = useCallback(
    (key: string) => {
      const action = strokeRef.current;
      if (action == null || lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      applyAction(key, action);
    },
    [applyAction],
  );

  const endStroke = useCallback(() => {
    strokeRef.current = null;
    lastKeyRef.current = null;
    flush();
  }, [flush]);

  const applyPatch = useCallback(
    (patch: ZipGridCells) => {
      if (Object.keys(patch).length === 0) return;
      setCells((cur) => ({ ...cur, ...patch }));
      pendingRef.current.patch = { ...pendingRef.current.patch, ...patch };
      pendingRef.current.erase = pendingRef.current.erase.filter((k) => !(k in patch));
      flush();
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  return {
    cells,
    brush,
    setBrush,
    saving,
    beginStroke,
    continueStroke,
    endStroke,
    applyPatch,
  };
}
