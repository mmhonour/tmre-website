import type { TownDescriptorStats } from '@/lib/intelligence-all-towns-descriptor'

export type SnapshotValueSignal = 'normal' | 'good' | 'bad'

export type SnapshotMetric = {
  label: string
  value: string
  trend: string
  tone: 'up' | 'down' | 'flat'
  valueSignal?: SnapshotValueSignal
  action?: 'new' | 'reduced' | 'closed'
  linkMedian?: boolean
}

export type IntelligenceTownSnapshot = {
  town: string
  zip: string | null
  title: string
  metrics: SnapshotMetric[]
  stats: TownDescriptorStats
}
