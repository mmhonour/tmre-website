import type { TownBudgetSnapshot } from '@/lib/town-budget/types'

/**
 * Fairfield FY 2026–2027 — RTM-approved operating budget with the Board of
 * Finance mill rate set June 2, 2026.
 *
 * EXACT (sourced from the town + press): total budget, Board of Education vs.
 * town-side split, mill rate (19.19, down from 28.39 in a revaluation year),
 * tax calendar and contacts.
 *
 * SYNTHESIZED / ESTIMATED (only the aggregate town-side and revenue totals are
 * published; the department- and revenue-line detail lives in the budget book):
 * the town-side is split into operations vs. reserves/debt using the First
 * Selectperson's proposal plus the Board of Finance's stated $2.6M town-side
 * cut; the revenue mix and fund-balance % are best estimates. Replace with the
 * budget-book line items when available.
 */
export const fairfieldFy2027: TownBudgetSnapshot = {
  town: 'Fairfield',
  fiscalYear: '2026–2027',
  sourceLabel: 'Town of Fairfield FY 2026–2027 Approved Budget & Mill Rate',
  sourceUrl: 'https://fairfieldct.gov/service/finance/2026-2027_budget.php',
  millRate: {
    current: 19.19,
    prior: 28.39,
    changePct: -32.41,
  },
  totalBudget: 400_371_929,
  stateAssistance: 12_000_000,
  fundBalanceReservePct: 10.0,
  highlights: [
    'Total approved budget of $400.4M — a 4.28% increase; the Board of Education receives 60.93% ($243.9M).',
    'Mill rate set at 19.19 — down from 28.39 — reflecting the 2025 revaluation that lifted the Grand List from $13.9B to $22.1B (a lower rate does not mean a lower bill).',
    'Gross tax levy up 4.28%; the town side (departments, reserves and debt service) totals $156.4M.',
    'Residential values rose faster than commercial, shifting more of the property-tax burden onto homeowners.',
    'The Board of Finance released prior-year surpluses and found $4.2M in added non-tax revenue and $2.6M in town-side savings to hold down the rate.',
    'Mill rate finalized by the Board of Finance on June 2, 2026; the budget runs July 1, 2026 – June 30, 2027 (AAA-rated town).',
  ],
  allocation: [
    {
      id: 'schools',
      label: 'Fairfield Public Schools',
      amount: 243_944_528,
      sharePct: 60.93,
    },
    {
      id: 'town',
      label: 'Town Government & Services',
      amount: 156_427_401,
      sharePct: 39.07,
    },
  ],
  revenues: [
    {
      id: 'taxes',
      label: 'Property tax levy (net)',
      amount: 358_700_000,
      sharePct: 89.58,
    },
    {
      id: 'non-tax',
      label: 'Non-tax revenue (fees, charges, investment income)',
      amount: 20_000_000,
      sharePct: 5.0,
    },
    {
      id: 'state',
      label: 'State grants',
      amount: 12_000_000,
      sharePct: 3.0,
    },
    {
      id: 'fund-balance',
      label: 'Appropriated fund balance / reserves',
      amount: 9_671_929,
      sharePct: 2.42,
    },
  ],
  expenditures: [
    {
      id: 'education',
      label: 'Education (Board of Education)',
      amount: 243_944_528,
      sharePct: 60.93,
    },
    {
      id: 'town-ops',
      label: 'Town departments & operations',
      amount: 131_827_401,
      sharePct: 32.93,
    },
    {
      id: 'reserves-debt',
      label: 'Reserves, insurance & debt service',
      amount: 24_600_000,
      sharePct: 6.14,
    },
  ],
  taxCalendar: [
    { month: 'Jul', day: '1', note: 'First real-estate quarter due; annual motor-vehicle and first personal-property installment due (prior Oct. 1 Grand List).' },
    { month: 'Aug', day: '1', note: 'Last day to pay the July installment without interest (one-month grace period).' },
    { month: 'Oct', day: '1', note: 'Second real-estate quarter due; Grand List assessment date for the next fiscal year.' },
    { month: 'Nov', day: '1', note: 'Last day to pay the October installment without interest.' },
    { month: 'Jan', day: '1', note: 'Third real-estate quarter due; supplemental motor-vehicle and second personal-property installment due.' },
    { month: 'Feb', day: '1', note: 'Last day to pay the January installment without interest.' },
    { month: 'Apr', day: '1', note: 'Fourth real-estate quarter due.' },
    { month: 'May', day: '1', note: 'Last day to pay the April installment without interest.' },
    { month: '—', day: '—', note: 'Bills of $100 or less are due in full on July 1; delinquent balances accrue 1.5% per month (18% annually).' },
  ],
  contacts: {
    taxCollectorPhone: '(203) 256-3101',
    taxCollectorUrl: 'https://www.fairfieldct.org/taxcollector',
    payTaxesUrl: 'https://www.fairfieldct.org/taxpayment',
    payTaxesLabel: 'fairfieldct.org/taxpayment',
    assessorPhone: '(203) 256-3110',
    townHallAddress: 'Old Town Hall, 611 Old Post Road, Fairfield, CT 06824',
  },
}
