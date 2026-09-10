export function FindAddressDivergenceNote({
  visionStreet,
  mlsStreet,
  tone = 'dark',
}: {
  visionStreet: string
  mlsStreet: string
  tone?: 'dark' | 'light'
}) {
  const label =
    tone === 'dark' ? 'text-white/45' : 'text-slate/55'
  const value =
    tone === 'dark' ? 'text-white/85' : 'text-navy'
  const box =
    tone === 'dark'
      ? 'border-white/15 bg-white/[0.06]'
      : 'border-charcoal/[0.1] bg-white'

  return (
    <div className={`mt-3 max-w-xl rounded-xl border px-4 py-3 ${box}`}>
      <p
        className={`font-mono text-[10px] tracking-[0.14em] uppercase ${label}`}
      >
        Address note
      </p>
      <p className={`mt-1 font-mono text-[12px] leading-relaxed ${value}`}>
        Assessor and MLS street lines differ. Same parcel.
      </p>
      <dl className="mt-2 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <dt
            className={`font-mono text-[10px] tracking-[0.12em] uppercase ${label}`}
          >
            Vision
          </dt>
          <dd className={`font-mono text-sm ${value}`}>{visionStreet}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <dt
            className={`font-mono text-[10px] tracking-[0.12em] uppercase ${label}`}
          >
            MLS
          </dt>
          <dd className={`font-mono text-sm ${value}`}>{mlsStreet}</dd>
        </div>
      </dl>
    </div>
  )
}
