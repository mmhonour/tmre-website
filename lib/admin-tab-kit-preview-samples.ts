/**
 * Real-world labels for each UI-kit surface (role).
 * After-previews keep these labels and only swap the visual kit.
 */

import type { AdminTabKitId } from '@/lib/admin-tab-kit'

export type TabKitZipButtonSample = {
  id: string
  label: string
  isAll: boolean
}

export type TabKitStatusChipSample = {
  label: string
  className: string
}

export type TabKitPreviewSample = {
  /** Source labels shown in Surface + After (never rewritten by a style remap). */
  labels: string[]
  /** Optional groups for separator-style kits (e.g. Intelligence filter trays). */
  labelGroups?: string[][]
  zipButtons?: TabKitZipButtonSample[]
  zipLinks?: { id: string; label: string }[]
  folderTabs?: string[]
  edgePills?: string[]
  statusChips?: TabKitStatusChipSample[]
}

const SAMPLES: Record<AdminTabKitId, TabKitPreviewSample> = {
  'pill-seg-dark-default': {
    labels: ['For Sale', 'Rentals'],
  },
  'pill-seg-dark-compact': {
    labels: ['All', 'For Sale', 'Rentals'],
  },
  'pill-seg-light-default': {
    labels: ['For Sale', 'Rentals'],
  },
  'pill-seg-light-compact': {
    labels: ['ALL', 'SFR', 'Condo', 'Rentals', 'Commercial'],
  },
  'pill-seg-dark-compact-sep': {
    labels: [
      'All',
      'For Sale',
      'Rentals',
      'All types',
      'Homes',
      'Multi-family',
      'Condos',
    ],
    labelGroups: [
      ['All', 'For Sale', 'Rentals'],
      ['All types', 'Homes', 'Multi-family', 'Condos'],
    ],
  },
  'pill-seg-unbordered-compact': {
    labels: ['For Sale', 'Rentals'],
  },
  'pill-ind-dark-compact': {
    labels: ['Sale', 'Rent'],
  },
  'pill-ind-light-compact': {
    labels: ['ALL', 'SFR', 'Condo', 'Rentals', 'Commercial'],
  },
  'pill-zip-button': {
    labels: ['All', '06880', '06840'],
    zipButtons: [
      { id: 'all', label: 'All', isAll: true },
      { id: '06880', label: '06880', isAll: false },
      { id: '06840', label: '06840', isAll: false },
    ],
  },
  'pill-zip-link': {
    labels: ['All', 'Westport', 'Wilton'],
    zipLinks: [
      { id: 'all', label: 'All' },
      { id: 'westport', label: 'Westport' },
      { id: 'wilton', label: 'Wilton' },
    ],
  },
  'underline-listing': {
    // Expanded comps group (ListingSubnav) — CSS uppercase → SOLD / RENTED / UNDER AGREEMENT
    labels: [
      'Overview',
      'Photos',
      'Sold',
      'Rented',
      'Under Agreement',
      'What if',
      'History',
    ],
  },
  'underline-admin-primary': {
    labels: ['Syncs', 'Visitors', 'Architecture'],
  },
  'underline-admin-nested': {
    labels: ['Dashboard', 'Configure', 'UI kit'],
  },
  'edge-listing-mobile': {
    labels: ['Insight', 'Details', 'What if', 'Map'],
    edgePills: ['Insight', 'Details', 'What if', 'Map'],
  },
  'folder-comps-mobile': {
    labels: ['Sold (12)', 'On the market (4)'],
    folderTabs: ['Sold (12)', 'On the market (4)'],
  },
  'status-deal-board': {
    labels: ['All', 'New', 'Reduced', 'Active'],
  },
  'status-latest': {
    labels: ['New', 'Reduced', 'Increased', 'Coming Soon'],
    statusChips: [
      { label: 'New', className: 'bg-sage/15 text-sage border-sage/30' },
      { label: 'Reduced', className: 'bg-coral/15 text-coral border-coral/30' },
      { label: 'Increased', className: 'bg-gold/15 text-navy border-gold/40' },
      {
        label: 'Coming Soon',
        className: 'bg-navy/10 text-navy border-navy/20',
      },
    ],
  },
}

export function previewSampleForRole(
  roleId: string,
): TabKitPreviewSample {
  if (roleId in SAMPLES) return SAMPLES[roleId as AdminTabKitId]!
  return { labels: ['One', 'Two', 'Three'] }
}
