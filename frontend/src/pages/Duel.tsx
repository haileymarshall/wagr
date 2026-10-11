import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { DuelSide } from '@wagr/shared'
import { parseEther } from 'viem'
import { useAccount } from 'wagmi'
import { Corner, FillBar, PhasePill, takersLabel, ticketNo } from '../components/Slip'
import { Timeline } from '../components/Timeline'
import { TxNotice } from '../components/TxNotice'
import { VerdictCard } from '../components/VerdictCard'
import { WalletButton } from '../components/WalletButton'
import { addressUrl, genlayerTxUrl } from '../lib/arc'
import {
  entryFee,
  opposite,
  phaseOf,
  sideOf,
  takerStakeOf,
  useChallengeWindow,
  useClaimable,
  useDuel,
  winningSide,
  winningsFor,
  type ChainDuel,
  type Phase,
} from '../lib/duels'
import { countdown, formatDate, sameAddress, shortAddress, usdc } from '../lib/format'
import { useEscrowTx } from '../lib/useTx'
import { useNow } from '../lib/useNow'

const GRACE_SECONDS = 7 * 86_400

export function Duel() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const { address } = useAccount()
  const now = useNow()
  const { metadata, chain, resolution, auto } = useDuel(id)
  const { data: challengeWindow = 1800 } = useChallengeWindow()
  const phase = chain.data ? phaseOf(chain.data, now) : undefined
  const { data: claimable = 0n } = useClaimable(id, address, phase)
  const tx = useEscrowTx()

  if (metadata.isLoading || chain.isLoading) return <p className="muted pad">Loading duel…</p>
  if (!metadata.data || !chain.data || !phase) {
    return (
      <div className="empty pad">
        <h1 className="page-title">Duel not found</h1>
        <p className="muted">There's no duel #{id} on this network.</p>
        <Link className="link" to="/duels">
          Browse duels →
        </Link>
      </div>
    )
  }

  const m = metadata.data
  const d = chain.data
  const mySide = sideOf(d, address)
  const winSide = winningSide(d)
  const duelId = BigInt(id ?? 0)
  const pot = d.matched > 0n ? d.matched * 2n : d.stake
  const seat = (side: DuelSide) => {
    const isCreator = side === d.creatorSide
    const filled = isCreator || d.takers.length > 0
    return (
      <Corner
        big
        side={side}
        who={isCreator ? d.creator : undefined}
        label={isCreator ? undefined : takersLabel(d, address)}
        me={address}
        won={Boolean(winSide && filled && winSide === side)}
        lost={Boolean(winSide && filled && winSide !== side)}
      />
    )
  }

  return (
    <div className="duel stack-lg">
      {search.get('new') && phase === 'open' && (
        <div className="notice pos">Your duel is live. Send the link to whoever you think is wrong — several people can each take a piece.</div>
      )}

      <section className="bill">
        <div className="bill-top">
          <span className="stub-no">No. {ticketNo(id ?? 0)}</span>
          {m.category && <span className="tag">{m.category}</span>}
          <PhasePill phase={phase} />
          <span className="grow" />
          <ShareButton />
        </div>
        <h1 className="bill-claim">{m.claim}</h1>
        <div className="faceoff">
          {seat('YES')}
          <div className="faceoff-mid">
            <span className="vs">vs</span>
            <span className="pot-amount">{usdc(pot)}</span>
            <span className="pot-unit">{d.matched > 0n ? 'USDC pot' : 'USDC posted'}</span>
          </div>
          {seat('NO')}
        </div>
        {d.matched < d.stake && phase !== 'canceled' && <FillBar duel={d} />}
        <Timeline phase={phase} />
      </section>

      <div className="duel-body">
        <div className="stack-md">
          <ActionPanel
            phase={phase}
            duel={d}
            duelId={duelId}
            me={address}
            mySide={mySide}
            claimable={claimable}
            now={now}
            challengeWindow={challengeWindow}
            autoPending={auto.data?.pending ?? null}
            tx={tx}
          />
          <TxNotice state={tx.state} onClose={tx.reset} />
          {resolution.data && (
            <VerdictCard
              verdict={resolution.data.verdict}
              genlayerTxHash={resolution.data.genlayerTxHash ?? d.genlayerTxHash}
              attesters={resolution.data.attesters}
            />
          )}
        </div>

        <aside className="stack-md">
          <div className="card fineprint stack-sm">
            <p className="kicker">The terms</p>
            <p>{m.resolutionRules}</p>
            <dl className="facts">
              <dt>Ends</dt>
              <dd>{formatDate(d.expiry)}</dd>
              <dt>{d.creatorSide}</dt>
              <dd>
                <span className="mono">{usdc(d.stake)} USDC</span> by{' '}
                <a className="link mono" href={addressUrl(d.creator)} target="_blank" rel="noreferrer">
                  {sameAddress(d.creator, address) ? 'you' : shortAddress(d.creator)}
                </a>
              </dd>
              <dt>{opposite(d.creatorSide)}</dt>
              <dd className="mono">{usdc(d.matched)} USDC matched</dd>
              <dt>Fee</dt>
              <dd>0.5% when you stake, 0.5% of the winnings. Void duels refund every stake.</dd>
            </dl>
          </div>
          {d.takers.length > 0 && (
            <div className="card fineprint stack-sm">
              <p className="kicker">
                {opposite(d.creatorSide)} side · {d.takers.length} taker{d.takers.length === 1 ? '' : 's'}
              </p>
              <ul className="takers">
                {d.takers.map((t) => (
                  <li key={t.address} className={sameAddress(t.address, address) ? 'me' : ''}>
                    <a className="link mono" href={addressUrl(t.address)} target="_blank" rel="noreferrer">
                      {sameAddress(t.address, address) ? 'You' : shortAddress(t.address)}
                    </a>
                    <span className="mono">{usdc(t.stake)} USDC</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card fineprint stack-sm">
            <p className="kicker">Evidence the AI will read</p>
            <ul className="sources">
              {m.evidenceUrls.map((u) => (
                <li key={u}>
                  <a className="link mono small" href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
            <p className="hint">Only these domains can be read: {m.allowedDomains.join(', ')}.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ShareButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn btn-line btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href.split('?')[0])
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }}
    >
      {copied ? 'Link copied ✓' : 'Copy link'}
    </button>
  )
}

/** Amount box for taking part (or all) of the open side. */
function TakeForm({ duel: d, duelId, tx }: { duel: ChainDuel; duelId: bigint; tx: ReturnType<typeof useEscrowTx> }) {
  const open = opposite(d.creatorSide)
  const remaining = d.stake - d.matched
  const [value, setValue] = useState(() => usdcInput(remaining))
  let amount = 0n
  try {
    amount = parseEther(value || '0')
  } catch {
    amount = 0n
  }
  const tooMuch = amount > remaining
  const fee = entryFee(amount)
  const quick = [
    { label: '25%', v: remaining / 4n },
    { label: '50%', v: remaining / 2n },
    { label: 'All', v: remaining },
  ].filter((q) => q.v > 0n)

  return (
    <div className="take">
      <label className="field">
        <span className="label">Your stake on {open}</span>
        <div className="input-suffix">
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span>USDC</span>
        </div>
      </label>
      <div className="chips">
        {quick.map((q) => (
          <button type="button" key={q.label} className="chip" onClick={() => setValue(usdcInput(q.v))}>
            {q.label}
          </button>
        ))}
      </div>
      <dl className="quote">
        <dt>Entry fee (0.5%)</dt>
        <dd className="mono">{usdc(fee)} USDC</dd>
        <dt>You pay</dt>
        <dd className="mono strong">{usdc(amount + fee)} USDC</dd>
        <dt>If {open} wins</dt>
        <dd className="mono win">{usdc(winningsFor(amount))} USDC</dd>
      </dl>
      {tooMuch && <p className="hint neg">Only {usdc(remaining)} USDC is still open.</p>}
      <button
        className={`btn btn-lg btn-side side-fill-${open.toLowerCase()}`}
        disabled={tx.busy || amount <= 0n || tooMuch}
        onClick={() => tx.send(`Taking ${open}`, 'acceptDuel', [duelId, amount], amount + fee)}
      >
        Take {open} for {usdc(amount)} USDC
      </button>
    </div>
  )
}

/** Plain decimal string for an input, without grouping separators. */
function usdcInput(v: bigint): string {
  const s = (Number(v) / 1e18).toFixed(6)
  return s.replace(/\.?0+$/, '')
}

function ActionPanel(props: {
  phase: Phase
  duel: ChainDuel
  duelId: bigint
  me?: string
  mySide?: DuelSide
  claimable: bigint
  now: number
  challengeWindow: number
  autoPending: { genlayerTxHash: string; lastError?: string } | null
  tx: ReturnType<typeof useEscrowTx>
}) {
  const { phase, duel: d, duelId, me, mySide, claimable, now, challengeWindow, autoPending, tx } = props
  const isCreator = sameAddress(d.creator, me)
  const expired = now / 1000 >= d.expiry
  const open = opposite(d.creatorSide)
  const remaining = d.stake - d.matched
  const myTake = takerStakeOf(d, me)

  const panel = (title: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div className={`card action action-${phase}`}>
      <h2>{title}</h2>
      <div className="action-body">{body}</div>
      {action && <div className="row gap wrap">{action}</div>}
    </div>
  )
  const needWallet = !me && <WalletButton />
  const claimButton = claimable > 0n && (
    <button className="btn btn-money btn-lg" disabled={tx.busy} onClick={() => tx.send('Claiming', 'claim', [duelId])}>
      Claim {usdc(claimable)} USDC
    </button>
  )

  switch (phase) {
    case 'open':
      if (isCreator) {
        if (d.matched === 0n)
          return panel(
            expired ? 'Nobody took the other side' : 'Waiting for takers',
            expired
              ? 'This duel ended before anyone matched it. Cancel it to get your stake back (the 0.5% entry fee is kept).'
              : `Share the link. Anyone can take ${open} with any amount up to ${usdc(d.stake)} USDC. Ends in ${countdown(d.expiry, now)}.`,
            <button className="btn btn-line" disabled={tx.busy} onClick={() => tx.send('Canceling the duel', 'cancelOpenDuel', [duelId])}>
              Cancel and refund {usdc(d.stake)} USDC
            </button>,
          )
        return panel(
          'Filling up',
          `${usdc(d.matched)} of your ${usdc(d.stake)} USDC is matched. More takers can join for the next ${countdown(
            d.expiry,
            now,
          )}. Whatever is still unmatched at the end comes back to you.`,
        )
      }
      return panel(
        myTake > 0n ? `You're in for ${usdc(myTake)} USDC` : `Take ${open}`,
        <>
          {usdc(remaining)} USDC of {open} is still open. Take any amount — if the AI rules {open}, you get double your stake
          back, less the 0.5% settlement fee. Ends in <strong className="mono">{countdown(d.expiry, now)}</strong>.
        </>,
        needWallet || <TakeForm key={remaining.toString()} duel={d} duelId={duelId} tx={tx} />,
      )

    case 'live':
      return panel(
        'Fully matched',
        <>
          The duel ends in <strong className="mono">{countdown(d.expiry, now)}</strong>. Then the AI reads the evidence and decides —
          nobody needs to do anything.
          {mySide && <> You're on <strong>{mySide}</strong>.</>}
        </>,
      )

    case 'judging': {
      const timedOut = now / 1000 >= d.expiry + GRACE_SECONDS
      return panel(
        'The AI is judging',
        <>
          GenLayer validators are reading the evidence and agreeing on a verdict. This usually takes a few minutes; it happens
          automatically.
          {d.matched < d.stake && ` The unmatched ${usdc(d.stake - d.matched)} USDC goes back to the creator after settlement.`}
          {autoPending && (
            <>
              {' '}
              <a className="link" href={genlayerTxUrl(autoPending.genlayerTxHash)} target="_blank" rel="noreferrer">
                Watch it on GenLayer ↗
              </a>
            </>
          )}
        </>,
        timedOut && (
          <button className="btn btn-line" disabled={tx.busy} onClick={() => tx.send('Releasing stakes', 'markResolutionTimedOut', [duelId])}>
            No verdict after 7 days — refund everyone
          </button>
        ),
      )
    }

    case 'verdict': {
      const closes = d.verdictProposedAt + challengeWindow
      const windowOpen = now / 1000 <= closes
      const iLose = mySide && d.verdict !== 'INVALID' && mySide !== d.verdict
      return panel(
        d.verdict === 'INVALID' ? 'The AI couldn’t decide' : `The AI says ${d.verdict}`,
        windowOpen ? (
          <>
            Anyone in the duel has <strong className="mono">{countdown(closes, now)}</strong> to challenge before it's final.
            {d.verdict === 'INVALID' && ' If it stands, every stake is refunded.'}
          </>
        ) : (
          'The challenge window has closed. The result is being finalized.'
        ),
        <>
          {windowOpen && mySide && (
            <button
              className={`btn ${iLose ? 'btn-ink' : 'btn-line'}`}
              disabled={tx.busy}
              onClick={() => tx.send('Challenging the verdict', 'challengeVerdict', [duelId])}
            >
              Challenge this verdict
            </button>
          )}
          {!windowOpen && (
            <button className="btn btn-line" disabled={tx.busy} onClick={() => tx.send('Finalizing', 'finalizeVerdict', [duelId])}>
              Finalize now
            </button>
          )}
        </>,
      )
    }

    case 'challenged': {
      const closes = d.verdictProposedAt + challengeWindow
      return panel(
        'Verdict challenged',
        now / 1000 <= closes
          ? `It now needs every attester to agree. If they don't within ${countdown(closes, now)}, every stake is refunded.`
          : 'The attesters did not all agree, so the duel settles as void and every stake is refunded.',
        now / 1000 > closes && (
          <button className="btn btn-line" disabled={tx.busy} onClick={() => tx.send('Settling as void', 'finalizeChallenge', [duelId])}>
            Settle and refund
          </button>
        ),
      )
    }

    case 'settled': {
      const won = mySide === d.verdict
      if (claimable > 0n)
        return panel(
          won ? 'You won' : 'Your unmatched stake',
          won
            ? `${d.verdict} called it. Your winnings are ready, after the 0.5% settlement fee.`
            : `${d.verdict} won this one, but the part of your stake nobody matched is yours to take back.`,
          claimButton,
        )
      return panel(
        `${d.verdict} wins`,
        mySide ? (won ? 'You already collected your winnings.' : 'Not this time. The winners can now claim.') : `${d.verdict} takers can now claim.`,
        needWallet,
      )
    }

    case 'refund':
      return panel(
        'No winner — stakes refunded',
        'The duel was ruled void, so everyone gets their stake back. No settlement fee is taken.',
        claimButton || needWallet,
      )

    case 'paid':
      return panel(
        d.verdict === 'INVALID' ? 'Refunded' : 'Paid out',
        d.verdict === 'INVALID' ? 'Every stake was returned.' : `${d.verdict} took the ${usdc(d.matched * 2n)} USDC pot.`,
      )

    default:
      return panel('Canceled', 'The creator canceled this duel before anyone took the other side. Their stake was returned.')
  }
}
