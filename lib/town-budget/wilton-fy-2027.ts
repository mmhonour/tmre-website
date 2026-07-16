import type { TownBudgetSnapshot } from '@/lib/town-budget/types'

/**
 * Wilton FY 2026–2027 — Board of Selectmen approved budget for the May 5, 2026
 * Annual Town Meeting (certified May 2026).
 *
 * EXACT (BOS/BOF resolutions + town news): total budget, BOE and BOS operating
 * splits, mill rate (25.0623 vs. 24.4054), non-property-tax revenue budget,
 * tax calendar and contacts.
 *
 * SYNTHESIZED: revenue property-tax levy (total minus published non-tax revenue),
 * debt service (remainder after BOE, BOS, reserves and tax relief), and
 * fund-balance % (15% policy target; town working toward Moody’s Aaa reserve
 * guidance).
 */
export const wiltonFy2027: TownBudgetSnapshot = {
  town: 'Wilton',
  fiscalYear: '2026–2027',
  sourceLabel: 'Town of Wilton BOS Approved Budget — Annual Town Meeting (May 2026)',
  sourceUrl:
    'https://www.wiltonct.gov/sites/g/files/vyhlif10026/f/uploads/bos_approved_budget_for_annual_town_meeting_5.5.26.pdf',
  millRate: {
    current: 25.0623,
    prior: 24.4054,
    changePct: 2.69,
  },
  totalBudget: 151_701_690,
  stateAssistance: 455_928,
  fundBalanceReservePct: 15.0,
  highlights: [
    'Total approved budget of $151.7M — a 4.0% increase; Wilton Public Schools receive 66.2% ($100.5M).',
    'Mill rate set at 25.0623 — up 2.7% from 24.4054; stronger-than-expected Grand List growth from new housing helped hold the rate below the 4% spending increase.',
    'Board of Education budget up $3.5M (3.6%); Board of Selectmen operating budget $37.9M (+4.4%), driven largely by employee health benefits.',
    'Adopted at the May 2026 Annual Town Meeting with 72.8% approval; turnout was 13.59% — below the 15% charter threshold, so the budget passed by default.',
    'Voters also approved $12.3M in separate bonding for schools, roads, bridges, and recreation infrastructure.',
    'Aaa-rated town with a written policy targeting 15–17% unassigned fund balance of operating revenues.',
  ],
  allocation: [
    {
      id: 'schools',
      label: 'Wilton Public Schools',
      amount: 100_459_485,
      sharePct: 66.22,
    },
    {
      id: 'town',
      label: 'Town Government & Services',
      amount: 51_242_205,
      sharePct: 33.78,
    },
  ],
  revenues: [
    {
      id: 'taxes',
      label: 'Property tax levy',
      amount: 144_322_307,
      sharePct: 95.14,
    },
    {
      id: 'non-tax',
      label: 'Non-property tax revenue (fees, charges, permits)',
      amount: 7_379_383,
      sharePct: 4.86,
    },
  ],
  expenditures: [
    {
      id: 'education',
      label: 'Education (Board of Education)',
      amount: 100_459_485,
      sharePct: 66.22,
    },
    {
      id: 'town-ops',
      label: 'Town departments & operations',
      amount: 37_912_303,
      sharePct: 25.0,
    },
    {
      id: 'debt',
      label: 'Debt service',
      amount: 10_695_109,
      sharePct: 7.05,
    },
    {
      id: 'reserves-relief',
      label: 'Charter reserves & senior tax relief',
      amount: 2_634_793,
      sharePct: 1.74,
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
