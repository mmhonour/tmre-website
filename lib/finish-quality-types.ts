export type FinishQualityTier = 'Premium' | 'Updated' | 'Dated' | 'Builder-grade'

export type FinishQualityAssessment = {
  tier: FinishQualityTier | null
  note: string
  assessedAt: string
  source: 'ai' | 'cached' | 'unavailable'
  photoCount?: number
}
