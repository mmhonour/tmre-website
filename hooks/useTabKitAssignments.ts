"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminTabKitId } from "@/lib/admin-tab-kit";
import { TMRE_TAB_KIT_ASSIGNMENTS_CHANGED } from "@/lib/tab-kit-events";
import {
  defaultTabKitAssignments,
  type TabKitAssignments,
} from "@/lib/tab-kit-assignments-shared";
import {
  segmentedClassesForRole,
  type TabKitSegmentedClasses,
} from "@/lib/tab-kit-style";

export function useTabKitAssignments(): TabKitAssignments {
  const [assignments, setAssignments] = useState<TabKitAssignments>(
    defaultTabKitAssignments,
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tab-kit-assignments", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { assignments?: TabKitAssignments };
      if (body.assignments) setAssignments(body.assignments);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void load();
    const onChanged = () => {
      void load();
    };
    window.addEventListener(TMRE_TAB_KIT_ASSIGNMENTS_CHANGED, onChanged);
    return () => {
      window.removeEventListener(TMRE_TAB_KIT_ASSIGNMENTS_CHANGED, onChanged);
    };
  }, [load]);

  return assignments;
}

/** Live segmented/independent pill classes for a surface role (honors Admin remaps). */
export function useTabKitSegmentedStyle(
  roleId: AdminTabKitId,
): TabKitSegmentedClasses {
  const assignments = useTabKitAssignments();
  return segmentedClassesForRole(roleId, assignments);
}
