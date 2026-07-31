/**
 * Historical BLS CPI-U prints (pre–forward calendar) for /fed-analysis CPI timeline.
 * YoY = 12-month % change, all items, not seasonally adjusted (CUUR0000SA0).
 * MoM = seasonally adjusted monthly % change when recorded for coloring.
 * Kept separate so the forward schedule in cpi-calendar.ts stays editable.
 */

import type { CpiRelease } from '@/lib/cpi-calendar'

type HistRow = {
  /** Reference month YYYY-MM */
  ref: string
  /** BLS release day YYYY-MM-DD */
  release: string
  yoy: number
  mom?: number | null
  note?: string
}

function row(r: HistRow): CpiRelease {
  return {
    id: r.ref,
    referenceMonth: r.ref,
    releaseDate: r.release,
    releaseTimeEt: '8:30 a.m. ET',
    momPct: r.mom ?? null,
    yoyPct: r.yoy,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
    note: r.note,
  }
}

/** Monthly prints from the COVID trough through end-2024. */
const ROWS: readonly HistRow[] = [
  // —— 2020 ——
  { ref: '2020-01', release: '2020-02-13', yoy: 2.5, mom: 0.1 },
  { ref: '2020-02', release: '2020-03-11', yoy: 2.3, mom: 0.1 },
  { ref: '2020-03', release: '2020-04-10', yoy: 1.5, mom: -0.4 },
  { ref: '2020-04', release: '2020-05-12', yoy: 0.3, mom: -0.8 },
  { ref: '2020-05', release: '2020-06-10', yoy: 0.1, mom: -0.1 },
  { ref: '2020-06', release: '2020-07-14', yoy: 0.6, mom: 0.6 },
  { ref: '2020-07', release: '2020-08-12', yoy: 1.0, mom: 0.6 },
  { ref: '2020-08', release: '2020-09-11', yoy: 1.3, mom: 0.4 },
  { ref: '2020-09', release: '2020-10-13', yoy: 1.4, mom: 0.2 },
  { ref: '2020-10', release: '2020-11-12', yoy: 1.2, mom: 0.0 },
  { ref: '2020-11', release: '2020-12-10', yoy: 1.2, mom: 0.2 },
  { ref: '2020-12', release: '2021-01-13', yoy: 1.4, mom: 0.4 },
  // —— 2021 ——
  { ref: '2021-01', release: '2021-02-10', yoy: 1.4, mom: 0.3 },
  { ref: '2021-02', release: '2021-03-10', yoy: 1.7, mom: 0.4 },
  { ref: '2021-03', release: '2021-04-13', yoy: 2.6, mom: 0.6 },
  { ref: '2021-04', release: '2021-05-12', yoy: 4.2, mom: 0.8 },
  { ref: '2021-05', release: '2021-06-10', yoy: 5.0, mom: 0.6 },
  { ref: '2021-06', release: '2021-07-13', yoy: 5.4, mom: 0.9 },
  { ref: '2021-07', release: '2021-08-11', yoy: 5.4, mom: 0.5 },
  { ref: '2021-08', release: '2021-09-14', yoy: 5.3, mom: 0.3 },
  { ref: '2021-09', release: '2021-10-13', yoy: 5.4, mom: 0.4 },
  { ref: '2021-10', release: '2021-11-10', yoy: 6.2, mom: 0.9 },
  { ref: '2021-11', release: '2021-12-10', yoy: 6.8, mom: 0.8 },
  { ref: '2021-12', release: '2022-01-12', yoy: 7.0, mom: 0.5 },
  // —— 2022 ——
  { ref: '2022-01', release: '2022-02-10', yoy: 7.5, mom: 0.6 },
  { ref: '2022-02', release: '2022-03-10', yoy: 7.9, mom: 0.8 },
  { ref: '2022-03', release: '2022-04-12', yoy: 8.5, mom: 1.2 },
  { ref: '2022-04', release: '2022-05-11', yoy: 8.3, mom: 0.3 },
  { ref: '2022-05', release: '2022-06-10', yoy: 8.6, mom: 1.0 },
  { ref: '2022-06', release: '2022-07-13', yoy: 9.1, mom: 1.3 },
  { ref: '2022-07', release: '2022-08-10', yoy: 8.5, mom: 0.0 },
  { ref: '2022-08', release: '2022-09-13', yoy: 8.3, mom: 0.1 },
  { ref: '2022-09', release: '2022-10-13', yoy: 8.2, mom: 0.4 },
  { ref: '2022-10', release: '2022-11-10', yoy: 7.7, mom: 0.4 },
  { ref: '2022-11', release: '2022-12-13', yoy: 7.1, mom: 0.1 },
  { ref: '2022-12', release: '2023-01-12', yoy: 6.5, mom: -0.1 },
  // —— 2023 ——
  { ref: '2023-01', release: '2023-02-14', yoy: 6.4, mom: 0.5 },
  { ref: '2023-02', release: '2023-03-14', yoy: 6.0, mom: 0.4 },
  { ref: '2023-03', release: '2023-04-12', yoy: 5.0, mom: 0.1 },
  { ref: '2023-04', release: '2023-05-10', yoy: 4.9, mom: 0.4 },
  { ref: '2023-05', release: '2023-06-13', yoy: 4.0, mom: 0.1 },
  { ref: '2023-06', release: '2023-07-12', yoy: 3.0, mom: 0.2 },
  { ref: '2023-07', release: '2023-08-10', yoy: 3.2, mom: 0.2 },
  { ref: '2023-08', release: '2023-09-13', yoy: 3.7, mom: 0.6 },
  { ref: '2023-09', release: '2023-10-12', yoy: 3.7, mom: 0.4 },
  { ref: '2023-10', release: '2023-11-14', yoy: 3.2, mom: 0.0 },
  { ref: '2023-11', release: '2023-12-12', yoy: 3.1, mom: 0.1 },
  { ref: '2023-12', release: '2024-01-11', yoy: 3.4, mom: 0.3 },
  // —— 2024 ——
  { ref: '2024-01', release: '2024-02-13', yoy: 3.1, mom: 0.3 },
  { ref: '2024-02', release: '2024-03-12', yoy: 3.2, mom: 0.4 },
  { ref: '2024-03', release: '2024-04-10', yoy: 3.5, mom: 0.4 },
  { ref: '2024-04', release: '2024-05-15', yoy: 3.4, mom: 0.3 },
  { ref: '2024-05', release: '2024-06-12', yoy: 3.3, mom: 0.0 },
  { ref: '2024-06', release: '2024-07-11', yoy: 3.0, mom: -0.1 },
  { ref: '2024-07', release: '2024-08-14', yoy: 2.9, mom: 0.2 },
  { ref: '2024-08', release: '2024-09-11', yoy: 2.5, mom: 0.2 },
  { ref: '2024-09', release: '2024-10-10', yoy: 2.4, mom: 0.2 },
  { ref: '2024-10', release: '2024-11-13', yoy: 2.6, mom: 0.2 },
  { ref: '2024-11', release: '2024-12-11', yoy: 2.7, mom: 0.3 },
  { ref: '2024-12', release: '2025-01-15', yoy: 2.9, mom: 0.4 },
]

export const CPI_HISTORY: readonly CpiRelease[] = ROWS.map(row)
