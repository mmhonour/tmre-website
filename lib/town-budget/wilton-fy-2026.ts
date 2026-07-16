import type { TownBudgetSnapshot } from '@/lib/town-budget/types'

/**
 * Wilton FY 2025–2026 — Board of Selectmen approved budget (March 10, 2025),
 * adopted at the May 2025 Annual Town Meeting.
 *
 * EXACT (BOS/BOF resolutions + voter certification): total operating budget,
 * BOE and BOS operating splits, mill rate (24.4054 vs. 23.9435), non-property-
 * tax revenue, tax calendar and contacts.
 *
 * SYNTHESIZED: property-tax levy (total minus published non-tax revenue) and
 * fund-balance % (15% policy target).
 */
export const wiltonFy2026: TownBudgetSnapshot = {
  town: 'Wilton',
  fiscalYear: '2025–2026',
  sourceLabel: 'Town of Wilton BOS Approved Budget — FY 2026 (March 2025)',
  sourceUrl:
    'https://www.wiltonct.gov/sites/g/files/vyhlif10026/f/uploads/fy26_bos_approved_budget_3-10-25.pdf',
  millRate: {
    current: 24.4054,
    prior: 23.9435,
    changePct: 1.93,
  },
  totalBudget: 145_835_795,
  stateAssistance: 455_928,
  fundBalanceReservePct: 15.0,
  highlights: [
    'Total approved budget of $145.8M — a 3.92% increase; Wilton Public Schools receive 66.5% ($97.0M).',
    'Mill rate set at 24.4054 — up 1.93% from 23.9435.',
    'Board of Education budget up $3.7M (4.0%); Board of Selectmen operating budget $37.1M (+3.6%).',
    'Passed at the May 2025 Annual Town Meeting with 77.8% approval and 15.2% turnout — meeting the charter threshold for a binding vote.',
    'Voters also approved ten capital bonding items totaling roughly $9.6M for schools, roads, and Ambler Farm.',
    'Town policy targets 15–17% unassigned fund balance of operating revenues (Aaa-rated).',
  ],
  allocation: [
    {
      id: 'schools',
      label: 'Wilton Public Schools',
      amount: 96_968_334,
      sharePct: 66.48,
    },
    {
      id: 'town',
      label: 'Town Government & Services',
      amount: 48_867_461,
      sharePct: 33.52,
    },
  ],
  revenues: [
    {
      id: 'taxes',
      label: 'Property tax levy',
      amount: 138_881_972,
      sharePct: 95.23,
    },
    {
      id: 'non-tax',
      label: 'Non-property tax revenue (fees, charges, permits)',
      amount: 6_953_823,
      sharePct: 4.77,
    },
  ],
  expenditures: [
    {
      id: 'education',
      label: 'Education (Board of Education)',
      amount: 96_968_334,
      sharePct: 66.48,
    },
    {
      id: 'town-ops',
      label: 'Town departments & operations',
      amount: 37_130_471,
      sharePct: 25.46,
    },
    {
      id: 'debt',
      label: 'Debt service',
      amount: 9_907_420,
      sharePct: 6.79,
    },
    {
      id: 'reserves',
      label: 'Charter reserves',
      amount: 1_829_570,
      sharePct: 1.25,
    },
  ],
  taxCalendar: [
    {
      month: 'Jul',
      day: '1',
      note: 'First installment due — real estate, personal property, and motor vehicles (prior Oct. 1 Grand List).',
    },
    {
      month: 'Aug',
      day: '1',
      note: 'Last day to pay the July installment without interest (one-month grace period).',
    },
    {
      month: 'Oct',
      day: '1',
      note: 'Grand List assessment date for the following fiscal year.',
    },
    {
      month: 'Jan',
      day: '1',
      note: 'Second installment due — real estate and personal property; supplemental motor-vehicle bills due.',
    },
    {
      month: 'Feb',
      day: '2',
      note: 'Last day to pay the January installment without interest (must be U.S.P.S. postmarked by this date).',
    },
    {
      month: '—',
      day: '—',
      note: 'Supplemental motor-vehicle taxes billed monthly for registrations May–September; 30-day grace on each bill. Delinquent balances accrue 18% annual interest back to the due date.',
    },
  ],
  contacts: {
    taxCollectorPhone: '(203) 563-0125',
    taxCollectorEmail: 'TaxCollector@wiltonct.gov',
    taxCollectorUrl: 'https://www.wiltonct.gov/tax-collector',
    payTaxesUrl: 'https://www.mytaxbill.org/inet/bill/home.do?town=wilton',
    payTaxesLabel: 'mytaxbill.org/wilton',
    assessorPhone: '(203) 563-0121',
    townHallAddress: '238 Danbury Road, Wilton, CT 06897',
  },
}
