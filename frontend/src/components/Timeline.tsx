import type { Phase } from '../lib/duels'

const STEPS = ['Open', 'Matched', 'Judging', 'Verdict', 'Settled'] as const

const INDEX: Record<Phase, number> = {
  open: 0,
  live: 1,
  judging: 2,
  verdict: 3,
  challenged: 3,
  settled: 4,
  refund: 4,
  paid: 5,
  canceled: -1,
}

/** Progress as punch holes along the slip: punched = done. */
export function Timeline({ phase }: { phase: Phase }) {
  const at = INDEX[phase]
  if (at < 0) return null
  return (
    <ol className="punches">
      {STEPS.map((label, i) => (
        <li key={label} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="hole" />
          <span className="punch-label">{label}</span>
        </li>
      ))}
    </ol>
  )
}
