import { Link } from 'react-router-dom'
import { phaseOf, useDuels } from '../lib/duels'
import { usdc } from '../lib/format'
import { PHASE_LABEL, ticketNo } from './Slip'

/** Scrolling board of recent duels under the masthead. */
export function Ticker() {
  const { records } = useDuels()
  const items = records.filter((r) => r.chain).slice(0, 12)
  if (!items.length) return null
  // Repeat short lists so one row always spans the screen.
  const filled = Array.from({ length: Math.ceil(8 / items.length) }, () => items).flat()
  const row = filled.map((r, i) => (
    <Link key={`${r.id}-${i}`} to={`/duel/${r.id}`} className="tick">
      <span className="tick-no">No.{ticketNo(r.id)}</span>
      <span className="tick-claim">{r.metadata.claim}</span>
      <span className="tick-pot">{usdc(r.chain!.matched > 0n ? r.chain!.matched * 2n : r.chain!.stake)} USDC</span>
      <span className={`tick-phase phase-${phaseOf(r.chain!)}`}>{PHASE_LABEL[phaseOf(r.chain!)]}</span>
    </Link>
  ))
  return (
    <div className="ticker" aria-label="Recent duels">
      <div className="ticker-track">
        <div className="ticker-row">{row}</div>
        <div className="ticker-row" aria-hidden>
          {row}
        </div>
      </div>
    </div>
  )
}
