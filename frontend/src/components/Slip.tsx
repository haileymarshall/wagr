import { Link } from 'react-router-dom'
import type { DuelSide } from '@wagr/shared'
import { countdown, sameAddress, shortAddress, usdc } from '../lib/format'
import { opposite, phaseOf, takerStakeOf, winningSide, type ChainDuel, type DuelRecord, type Phase } from '../lib/duels'
import { useNow } from '../lib/useNow'

export const PHASE_LABEL: Record<Phase, string> = {
  open: 'Seat open',
  live: 'Live',
  judging: 'AI judging',
  verdict: 'Verdict in',
  challenged: 'Challenged',
  settled: 'Settled',
  refund: 'Void · refunds',
  paid: 'Paid out',
  canceled: 'Canceled',
}

export function PhasePill({ phase }: { phase: Phase }) {
  return <span className={`phase phase-${phase}`}>{PHASE_LABEL[phase]}</span>
}

export const ticketNo = (id: string | number) => String(id).padStart(4, '0')

/** Rubber stamp for a decided duel. */
export function Stamp({ verdict, size = 'sm' }: { verdict: 'YES' | 'NO' | 'INVALID'; size?: 'sm' | 'lg' }) {
  const word = verdict === 'INVALID' ? 'Void' : `${verdict} wins`
  return <span className={`stamp stamp-${verdict.toLowerCase()} stamp-${size}`}>{word}</span>
}

/** One side of a duel: who's in that corner, or an open seat. */
export function Corner({
  side,
  who,
  label,
  me,
  won,
  lost,
  big,
  openLabel = 'Seat open',
}: {
  side: DuelSide
  who?: string
  /** Overrides the address, e.g. "3 takers". */
  label?: string
  me?: string
  won?: boolean
  lost?: boolean
  big?: boolean
  openLabel?: string
}) {
  const filled = Boolean(who || label)
  return (
    <div className={`corner corner-${side.toLowerCase()} ${filled ? '' : 'corner-open'} ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${big ? 'corner-big' : ''}`}>
      <span className="corner-side">{side}</span>
      <span className="corner-who">{label ?? (who ? (sameAddress(who, me) ? 'You' : shortAddress(who)) : openLabel)}</span>
    </div>
  )
}

/** Who holds the takers' corner, as one line. */
export function takersLabel(duel: ChainDuel, me?: string): string | undefined {
  const n = duel.takers.length
  if (n === 0) return undefined
  const mine = takerStakeOf(duel, me) > 0n
  if (n === 1) return mine ? 'You' : shortAddress(duel.takers[0].address)
  return mine ? `You + ${n - 1} more` : `${n} takers`
}

/** How much of the creator's stake has been matched. */
export function FillBar({ duel }: { duel: ChainDuel }) {
  const pct = duel.stake > 0n ? Number((duel.matched * 10_000n) / duel.stake) / 100 : 0
  return (
    <div className="fill">
      <div className="fill-track">
        <span className={`fill-bar side-fill-${opposite(duel.creatorSide).toLowerCase()}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="fill-text">
        {usdc(duel.matched)} / {usdc(duel.stake)} USDC matched
      </span>
    </div>
  )
}

/** A duel as a printed wager slip: stub on the left, the bet on the right. */
export function Slip({ record, me }: { record: DuelRecord; me?: string }) {
  const now = useNow()
  const { metadata, chain } = record
  const phase = chain ? phaseOf(chain, now) : 'open'
  const creatorSide: DuelSide = chain?.creatorSide ?? metadata.creatorSide
  const winSide = chain ? winningSide(chain) : undefined
  const expiry = chain?.expiry ?? Math.floor(new Date(metadata.expiryTime).getTime() / 1000)
  const decided = chain && ['settled', 'paid', 'refund'].includes(phase) && chain.verdict !== 'None' ? chain.verdict : undefined
  const pot = chain ? (chain.matched > 0n ? chain.matched * 2n : chain.stake) : undefined

  const seat = (side: DuelSide) => {
    const isCreator = side === creatorSide
    const filled = isCreator || Boolean(chain?.takers.length)
    return {
      who: isCreator ? chain?.creator : undefined,
      label: isCreator || !chain ? undefined : takersLabel(chain, me),
      won: Boolean(winSide && filled && winSide === side),
      lost: Boolean(winSide && filled && winSide !== side),
    }
  }

  return (
    <Link to={`/duel/${record.id}`} className="ticket">
      <div className="ticket-stub">
        <span className="stub-label">No.</span>
        <span className="stub-no">{ticketNo(record.id)}</span>
        <PhasePill phase={phase} />
        {(phase === 'open' || phase === 'live') && <span className="stub-time">ends {countdown(expiry, now)}</span>}
      </div>
      <div className="ticket-main">
        <div className="ticket-meta">
          {metadata.category && <span className="tag">{metadata.category}</span>}
          {chain && <span className="mono">{usdc(chain.stake)} USDC posted</span>}
        </div>
        <p className="ticket-claim">{metadata.claim}</p>
        <div className="ticket-foot">
          <div className="corners">
            {(['YES', 'NO'] as const).map((side) => (
              <Corner key={side} side={side} me={me} {...seat(side)} openLabel={side === opposite(creatorSide) ? 'Seat open' : '—'} />
            ))}
          </div>
          <div className="ticket-pot">
            <span className="pot-label">Pot</span>
            <span className="pot-amount">{pot !== undefined ? usdc(pot) : '—'}</span>
            <span className="pot-unit">USDC</span>
          </div>
        </div>
        {chain && phase === 'open' && chain.matched > 0n && <FillBar duel={chain} />}
        {decided && <Stamp verdict={decided} />}
      </div>
    </Link>
  )
}
