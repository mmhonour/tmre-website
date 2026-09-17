import 'server-only'

import { query } from '@/lib/db/postgres'
import { getActiveKnownCoverageTowns } from '@/lib/ct-coverage'
import { TMRE_TOWNS } from '@/lib/tmre-towns'
import {
  weekPointFromAsofRow,
  type MarketPulseWeekAsofSqlRow,
} from '@/lib/market-pulse-week-asof-map'
import type { MarketPulseWeekTownPoint } from '@/lib/market-pulse-week-cache'

/**
 * Stacked ALL-sales town points as they stood at the end of an Eastern
 * send-day. Used when that Monday was never archived (first weeks of WoW).
 */
export async function reconstructMarketPulseWeekTownPoints(
  slotDate: string,
): Promise<MarketPulseWeekTownPoint[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) return []
  const coverage = await getActiveKnownCoverageTowns()
  const towns = coverage.length > 0 ? [...coverage] : [...TMRE_TOWNS]
  if (towns.length === 0) return []

  const rows = await query<MarketPulseWeekAsofSqlRow>(
    `WITH params AS (
       SELECT $1::date AS slot_date,
              (($1::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/New_York')
                AS slot_start,
              ((($1::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/New_York')
                + interval '1 day') AS slot_end
     ),
     of_kind AS (
       SELECT l.town,
              l.status_bucket,
              l.price,
              l.close_price,
              l.original_list_price,
              l.dom,
              l.list_date,
              l.close_date,
              l.status_change_timestamp,
              COALESCE(l.close_date, l.status_change_timestamp) AS closed_at
         FROM listings l
        WHERE l.town = ANY($2::text[])
          AND concat_ws(
                ' ',
                l.property_type,
                l.raw->>'PropertyType',
                l.raw->>'PropertySubType',
                l.raw->>'TransactionType',
                l.raw->>'MRD_TYP',
                l.raw->>'StandardStatus'
              ) !~* 'rent|lease'
     ),
     labeled AS (
       SELECT o.town,
              (
                (COALESCE(o.list_date, o.status_change_timestamp) IS NULL
                  OR COALESCE(o.list_date, o.status_change_timestamp) < p.slot_end)
                AND (
                  o.status_bucket = 'Active'
                  OR (
                    o.status_bucket IN ('Closed', 'Expired')
                    AND o.closed_at IS NOT NULL
                    AND o.closed_at >= p.slot_end
                  )
                )
              ) AS is_active,
              CASE
                WHEN o.status_bucket = 'Active' AND o.dom IS NOT NULL THEN
                  GREATEST(
                    0,
                    o.dom - EXTRACT(EPOCH FROM (now() - p.slot_end)) / 86400.0
                  )
                WHEN COALESCE(o.list_date, o.status_change_timestamp) IS NOT NULL THEN
                  GREATEST(
                    0,
                    EXTRACT(
                      EPOCH FROM (
                        p.slot_end
                        - COALESCE(o.list_date, o.status_change_timestamp)
                      )
                    ) / 86400.0
                  )
                ELSE NULL
              END AS dom_asof,
              (
                o.status_bucket = 'Closed'
                AND o.closed_at IS NOT NULL
                AND o.closed_at < p.slot_end
                AND o.closed_at >= p.slot_end - interval '365 days'
              ) AS is_closed_12,
              CASE
                WHEN o.status_bucket = 'Closed'
                  AND o.closed_at IS NOT NULL
                  AND o.closed_at < p.slot_end
                  AND EXTRACT(YEAR FROM o.closed_at) >= 2024
                THEN COALESCE(o.close_price, o.price)
                ELSE NULL
              END AS amount,
              o.original_list_price,
              EXTRACT(YEAR FROM o.closed_at AT TIME ZONE 'UTC')::int AS close_y,
              EXTRACT(MONTH FROM o.closed_at AT TIME ZONE 'UTC')::int AS close_m,
              o.status_bucket,
              o.closed_at
         FROM of_kind o
         CROSS JOIN params p
     ),
     month_keys AS (
       SELECT EXTRACT(YEAR FROM d)::int AS y, EXTRACT(MONTH FROM d)::int AS m
         FROM params p,
              generate_series(
                date_trunc('month', p.slot_date::timestamp) - interval '3 months',
                date_trunc('month', p.slot_date::timestamp) - interval '1 month',
                interval '1 month'
              ) AS d
     ),
     mos_avg AS (
       SELECT COALESCE(town, 'All') AS city,
              COALESCE(sum(cnt), 0) / 3.0 AS avg_monthly_closings
         FROM (
           SELECT l.town,
                  mk.y,
                  mk.m,
                  count(*)::float AS cnt
             FROM labeled l
             JOIN month_keys mk ON mk.y = l.close_y AND mk.m = l.close_m
            WHERE l.status_bucket = 'Closed'
              AND l.closed_at IS NOT NULL
              AND l.closed_at < (SELECT slot_end FROM params)
            GROUP BY GROUPING SETS ((l.town, mk.y, mk.m), (mk.y, mk.m))
         ) month_counts
        GROUP BY 1
     ),
     metrics AS (
       SELECT COALESCE(town, 'All') AS city,
              count(*) FILTER (WHERE is_active)::int AS active_count,
              count(*) FILTER (WHERE is_closed_12)::int AS closed_12mo,
              avg(dom_asof) FILTER (WHERE is_active AND dom_asof IS NOT NULL)
                AS avg_dom,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY amount)
                FILTER (WHERE amount > 0) AS med_price,
              avg(amount) FILTER (WHERE amount > 0) AS avg_price,
              count(*) FILTER (
                WHERE amount > 0 AND original_list_price > 0
              )::int AS sta_n,
              sum(amount) FILTER (
                WHERE amount > 0 AND original_list_price > 0
              ) AS sta_closed,
              sum(original_list_price) FILTER (
                WHERE amount > 0 AND original_list_price > 0
              ) AS sta_orig
         FROM labeled
        GROUP BY GROUPING SETS ((town), ())
     )
     SELECT m.city,
            m.active_count,
            m.closed_12mo,
            m.avg_dom,
            m.med_price,
            m.avg_price,
            m.sta_n,
            m.sta_closed,
            m.sta_orig,
            a.avg_monthly_closings
       FROM metrics m
       LEFT JOIN mos_avg a ON a.city = m.city
      ORDER BY CASE WHEN m.city = 'All' THEN 0 ELSE 1 END, m.city`,
    [slotDate, towns],
  )

  return rows
    .filter((row) => {
      const n =
        row.active_count == null
          ? 0
          : typeof row.active_count === 'number'
            ? row.active_count
            : Number(row.active_count)
      return Boolean(row.city) && Number.isFinite(n) && n > 0
    })
    .map(weekPointFromAsofRow)
}
