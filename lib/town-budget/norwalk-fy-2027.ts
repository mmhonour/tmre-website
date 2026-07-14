import type { TownBudgetSnapshot } from '@/lib/town-budget/types'

/**
 * Norwalk FYE 2027 (FY 2026–2027) — BET-approved operating budget (May 7, 2026).
 * Top-line, allocation, revenue-by-source and expenditure figures are taken from
 * the City's approved budget documents; expenditure divisions are consolidated
 * into Westport-style functional buckets (the citywide salary-lapse credit is
 * netted into employee benefits). Fund-balance % is an estimate within the
 * City's stated 7.5%–15% policy band.
 */
export const norwalkFy2027: TownBudgetSnapshot = {
  town: 'Norwalk',
  fiscalYear: '2026–2027',
  sourceLabel: 'City of Norwalk FYE 2027 Operating Budget (BET Approved)',
  sourceUrl: 'https://www.norwalkct.gov/941/Budgets',
  millRate: {
    // Core taxing districts (1st/2nd/3rd); rates vary by district.
    current: 24.6275,
    prior: 23.9001,
    changePct: 3.04,
  },
  totalBudget: 478_561_036,
  stateAssistance: 22_381_809,
  fundBalanceReservePct: 13.0,
  highlights: [
    'Total approved budget of $478.6M — a 5.88% increase; the Board of Education receives 53.78% ($257.4M).',
    'Core-district mill rate (Districts 1–3) set at 24.6275 — up 3.04% from 23.9001; district rates range from 22.98 in Rowayton to 24.67 in the Fourth.',
    'Board of Education budget up $10.2M (4.12%); city operations up $16.4M (8.00%).',
    'Third year of a four-year revaluation phase-in; the motor-vehicle mill rate is 22.95 and personal property 32.00 (state-mandated).',
    '$7.0M drawn from fund balance to soften tax bills; the city targets an unassigned fund balance of 7.5%–15% of revenues (Aaa-rated).',
    'Norwalk levies taxes across six autonomous districts (First/Downtown, Second/South, Third/East, Fourth/Sewered, Fifth/citywide, Sixth/Rowayton), each with its own mill-rate components.',
  ],
  allocation: [
    {
      id: 'schools',
      label: 'Norwalk Public Schools',
      amount: 257_372_632,
      sharePct: 53.78,
    },
    {
      id: 'city',
      label: 'City Government',
      amount: 221_188_404,
      sharePct: 46.22,
    },
  ],
  revenues: [
    {
      id: 'taxes',
      label: 'Property taxes',
      amount: 424_387_213,
      sharePct: 88.68,
    },
    {
      id: 'intergovernmental',
      label: 'Intergovernmental (state aid)',
      amount: 22_381_809,
      sharePct: 4.68,
    },
    {
      id: 'departmental',
      label: 'Departmental receipts',
      amount: 13_817_170,
      sharePct: 2.89,
    },
    {
      id: 'fund-balance',
      label: 'Fund balance transfer',
      amount: 7_000_000,
      sharePct: 1.46,
    },
    {
      id: 'investment',
      label: 'Investment income',
      amount: 5_500_000,
      sharePct: 1.15,
    },
    {
      id: 'misc',
      label: 'Miscellaneous',
      amount: 2_825_804,
      sharePct: 0.59,
    },
    {
      id: 'interest',
      label: 'Interest & penalties',
      amount: 2_649_040,
      sharePct: 0.55,
    },
  ],
  expenditures: [
    {
      id: 'education',
      label: 'Education (Board of Education)',
      amount: 257_372_632,
      sharePct: 53.78,
    },
    {
      id: 'safety',
      label: 'Public safety (police & fire)',
      amount: 56_086_709,
      sharePct: 11.72,
    },
    {
      id: 'debt',
      label: 'Debt service',
      amount: 43_121_046,
      sharePct: 9.01,
    },
    {
      id: 'benefits',
      label: 'Employee benefits',
      amount: 34_883_608,
      sharePct: 7.29,
    },
    {
      id: 'works',
      label: 'Operations & public works',
      amount: 31_550_303,
      sharePct: 6.59,
    },
    {
      id: 'pension',
      label: 'Pension & retirement',
      amount: 20_458_024,
      sharePct: 4.27,
    },
    {
      id: 'community',
      label: 'Community services',
      amount: 11_526_051,
      sharePct: 2.41,
    },
    {
      id: 'finance',
      label: 'Finance',
      amount: 9_726_171,
      sharePct: 2.03,
    },
    {
      id: 'general',
      label: 'General government',
      amount: 7_476_949,
      sharePct: 1.56,
    },
    {
      id: 'econdev',
      label: 'Economic & community development',
      amount: 6_359_543,
      sharePct: 1.33,
    },
  ],
  taxCalendar: [
    { month: 'Jul', day: '1', note: 'First installment due — real estate & personal property; annual motor-vehicle bill due (prior Oct. 1 Grand List).' },
    { month: 'Aug', day: '1', note: 'Last day to pay the July installment without interest (one-month grace period).' },
    { month: 'Oct', day: '1', note: 'Grand List assessment date for the following fiscal year.' },
    { month: 'Jan', day: '1', note: 'Second installment due — real estate & personal property; supplemental motor-vehicle bills due.' },
    { month: 'Feb', day: '1', note: 'Last day to pay the January installment without interest.' },
    { month: '—', day: '—', note: 'Delinquent balances accrue interest at 1.5% per month (18% annually) from the due date.' },
  ],
  contacts: {
    taxCollectorPhone: '(203) 854-7731',
    taxCollectorUrl: 'https://www.norwalkct.gov/225/Tax-Collector',
    payTaxesUrl: 'https://www.mytaxbill.org/inet/bill/home.do?town=norwalk',
    payTaxesLabel: 'mytaxbill.org/norwalk',
    assessorPhone: '(203) 854-7888',
    townHallAddress: '125 East Avenue, Norwalk, CT 06851',
  },
}
