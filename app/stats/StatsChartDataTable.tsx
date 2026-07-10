"use client";

import type { ReactNode } from "react";

const thClass =
  "px-3 py-2.5 font-mono text-[10px] tracking-[0.12em] uppercase text-slate whitespace-nowrap";
const tdClass = "px-3 py-2 font-mono text-[11px] text-navy tabular-nums whitespace-nowrap";
const tdMuted = `${tdClass} text-charcoal/50`;

export function StatsChartDataTable({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="stats-chart-data-panel rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden">
      <div className="px-5 py-4 border-b border-charcoal/[0.08] bg-cream/60">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-1">
          {title}
        </p>
        {subtitle ? (
          <p className="font-serif text-lg text-navy leading-snug">{subtitle}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[320px]">{children}</table>
      </div>
      {footer ? (
        <div className="px-5 py-3 border-t border-charcoal/[0.08] bg-cream/40">{footer}</div>
      ) : null}
    </div>
  );
}

export function StatsChartDataTh({
  children,
  align = "left",
  colSpan,
}: {
  children: ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <th
      className={`${thClass} ${align === "right" ? "text-right" : ""}`}
      colSpan={colSpan}
    >
      {children}
    </th>
  );
}

export function StatsChartDataTd({
  children,
  align = "left",
  muted = false,
  bold = false,
  colSpan,
}: {
  children: ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  bold?: boolean;
  colSpan?: number;
}) {
  const base = muted ? tdMuted : tdClass;
  return (
    <td
      colSpan={colSpan}
      className={`${base} ${align === "right" ? "text-right" : ""} ${bold ? "font-medium" : ""}`}
    >
      {children}
    </td>
  );
}

export function StatsChartDataHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-charcoal/[0.12] bg-cream">{children}</thead>;
}

export function StatsChartDataBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function StatsChartDataRow({
  children,
  stripe,
}: {
  children: ReactNode;
  stripe?: boolean;
}) {
  return (
    <tr
      className={`border-b border-charcoal/[0.06] last:border-0 ${
        stripe ? "bg-cream/30" : "hover:bg-gold/5"
      }`}
    >
      {children}
    </tr>
  );
}
