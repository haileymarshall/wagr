import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Slip } from '../components/Slip'
import { phaseOf, useDuels, type Phase } from '../lib/duels'
import { useNow } from '../lib/useNow'

const FILTERS: { key: string; label: string; phases: Phase[] }[] = [
  { key: 'open', label: 'Open seats', phases: ['open'] },
  { key: 'live', label: 'Live', phases: ['live', 'judging', 'verdict', 'challenged'] },
  { key: 'done', label: 'Settled', phases: ['settled', 'refund', 'paid', 'canceled'] },
  { key: 'all', label: 'All', phases: [] },
]

export function Explore() {
  const now = useNow(10_000)
  const { address } = useAccount()
  const { records, isLoading, error } = useDuels()
  const [filter, setFilter] = useState('open')
  const active = FILTERS.find((f) => f.key === filter)!
  const matches = (phases: Phase[]) => records.filter((r) => !phases.length || (r.chain && phases.includes(phaseOf(r.chain, now))))
  const shown = matches(active.phases)

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="kicker">The board</p>
          <h1 className="page-title">Duels</h1>
          <p className="muted">Take an open seat, or watch the live ones get judged.</p>
        </div>
        <Link to="/new" className="btn btn-ink">
          Start a duel
        </Link>
      </div>
      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={f.key === filter} className={`tab ${f.key === filter ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="tab-count">{matches(f.phases).length}</span>
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="muted">Loading duels…</p>
      ) : error ? (
        <p className="neg">Couldn't reach the Wagr relayer. Refresh to try again.</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Nothing on the board here.</p>
          <Link to="/new" className="link">
            Start one →
          </Link>
        </div>
      ) : (
        <div className="tickets">
          {shown.map((r) => (
            <Slip key={r.id} record={r} me={address} />
          ))}
        </div>
      )}
    </div>
  )
}
