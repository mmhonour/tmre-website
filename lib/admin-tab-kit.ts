/**
 * Stable IDs for site-wide tab / pill visual systems.
 * Admin → Web server → UI kit renders a live preview for each entry.
 */

export type AdminTabKitSurface = 'dark' | 'light'
export type AdminTabKitViewport = 'both' | 'desktop' | 'mobile'

export type AdminTabKitEntry = {
  id: string
  group: string
  title: string
  where: string
  surface: AdminTabKitSurface
  viewport: AdminTabKitViewport
  note: string
}

export const ADMIN_TAB_KIT: readonly AdminTabKitEntry[] = [
  // —— Segmented gold pills ——
  {
    id: 'pill-seg-dark-default',
    group: 'Segmented gold pills',
    title: 'Segmented tray · dark · default',
    where: 'Stats kind (Sale/Rental), Fixer Uppers, Open Houses, New Construction',
    surface: 'dark',
    viewport: 'both',
    note: 'Shared filter bar via filterPillContainerClass + filterPillButtonClass.',
  },
  {
    id: 'pill-seg-dark-compact',
    group: 'Segmented gold pills',
    title: 'Segmented tray · dark · compact',
    where: 'Intelligence filter groups, Deal of the Week controls',
    surface: 'dark',
    viewport: 'both',
    note: 'Same helpers with size="compact".',
  },
  {
    id: 'pill-seg-light-default',
    group: 'Segmented gold pills',
    title: 'Segmented tray · light · default',
    where: 'Light pages when used at default size',
    surface: 'light',
    viewport: 'both',
    note: 'theme="light" on container + buttons.',
  },
  {
    id: 'pill-seg-light-compact',
    group: 'Segmented gold pills',
    title: 'Segmented tray · light · compact',
    where: 'Market Pulse category tabs',
    surface: 'light',
    viewport: 'both',
    note: 'Compact + light theme.',
  },
  {
    id: 'pill-seg-dark-compact-sep',
    group: 'Segmented gold pills',
    title: 'Segmented + separators · dark · compact',
    where: 'Intelligence / Fixer Uppers (desktop group separators)',
    surface: 'dark',
    viewport: 'desktop',
    note: 'filterPillSeparatorClass between option groups.',
  },
  {
    id: 'pill-seg-unbordered-compact',
    group: 'Segmented gold pills',
    title: 'Unbordered segmented · compact',
    where: 'Deal of the Week hero toggles',
    surface: 'dark',
    viewport: 'both',
    note: 'bordered: false on the tray.',
  },

  // —— Independent bordered pills ——
  {
    id: 'pill-ind-dark-compact',
    group: 'Independent bordered pills',
    title: 'Independent border · dark · compact',
    where: 'Listing What-if Sale/Rent toggle',
    surface: 'dark',
    viewport: 'both',
    note: 'filterPillIndependentButtonClass — each pill has its own border.',
  },
  {
    id: 'pill-ind-light-compact',
    group: 'Independent bordered pills',
    title: 'Independent border · light · compact',
    where: 'Same helpers on light surfaces',
    surface: 'light',
    viewport: 'both',
    note: 'Independent pills on cream / white.',
  },

  // —— Intelligence town / zip ——
  {
    id: 'pill-zip-button',
    group: 'Intelligence town / zip',
    title: 'Zip / town pill buttons',
    where: 'Intelligence hero zip row',
    surface: 'dark',
    viewport: 'both',
    note: 'filterPillZipButtonClass — mono uppercase; All uses white active fill.',
  },
  {
    id: 'pill-zip-link',
    group: 'Intelligence town / zip',
    title: 'Town filter links',
    where: 'Intelligence promoted town links',
    surface: 'dark',
    viewport: 'both',
    note: 'filterPillZipLinkClass + underline helper.',
  },

  // —— Underline strips ——
  {
    id: 'underline-listing',
    group: 'Underline tab strips',
    title: 'Listing subnav underline',
    where: 'Listing + Spotlight subnav (ListingSubnav)',
    surface: 'dark',
    viewport: 'both',
    note: 'Desktop full strip; mobile drops edge tabs (What if / Map → edge pills).',
  },
  {
    id: 'underline-admin-primary',
    group: 'Underline tab strips',
    title: 'Admin primary tabs',
    where: 'Admin top tab bar (AdminTabbedLayout)',
    surface: 'light',
    viewport: 'both',
    note: 'Navy bottom border on cream when selected.',
  },
  {
    id: 'underline-admin-nested',
    group: 'Underline tab strips',
    title: 'Admin nested panels',
    where: 'Syncs, Architecture, Data controls, etc.',
    surface: 'light',
    viewport: 'both',
    note: 'Smaller mono; gold bottom border when selected.',
  },

  // —— Mobile listing edge ——
  {
    id: 'edge-listing-mobile',
    group: 'Mobile listing edge',
    title: 'Right-edge half-pills',
    where: 'Listing hero below lg (Insight / Details / What if / Map)',
    surface: 'dark',
    viewport: 'mobile',
    note: 'Hidden from lg up; rounded-l-full stack on the listing sticky chrome.',
  },

  // —— Folder comps (added — distinct system used on mobile Sold) ——
  {
    id: 'folder-comps-mobile',
    group: 'Folder comps tabs',
    title: 'Sold / On the market folder tabs',
    where: 'Listing comps panel on mobile (ListingComparablesPanel)',
    surface: 'dark',
    viewport: 'mobile',
    note: 'Classic folder tabs: gold fill + navy label when selected.',
  },

  // —— Status-ish filters ——
  {
    id: 'status-deal-board',
    group: 'Status filter pills',
    title: 'Deal board status filters',
    where: 'Intelligence deal board (All / New / Reduced / Active)',
    surface: 'dark',
    viewport: 'both',
    note: 'Uses compact segmented pills; status meaning is in the labels.',
  },
  {
    id: 'status-latest',
    group: 'Status filter pills',
    title: 'Latest status chips',
    where: 'Latest feed row badges (New / Reduced / …)',
    surface: 'light',
    viewport: 'both',
    note: 'Status labels on rows — not a tab bar; shown for ID completeness.',
  },
] as const

export type AdminTabKitId = (typeof ADMIN_TAB_KIT)[number]['id']

export function adminTabKitGroups(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of ADMIN_TAB_KIT) {
    if (seen.has(row.group)) continue
    seen.add(row.group)
    out.push(row.group)
  }
  return out
}
