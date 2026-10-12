import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { deriveAllowedDomains, duelMetadataHash, evidencePolicyError, wagrDuelEscrowAbi, type DuelSide } from '@wagr/shared'
import { parseEther, parseEventLogs } from 'viem'
import { useAccount, useBalance } from 'wagmi'
import { WalletButton } from '../components/WalletButton'
import { TxNotice } from '../components/TxNotice'
import { arcChainId, isMainnet } from '../lib/arc'
import { formatDate, usdc } from '../lib/format'
import { Corner } from '../components/Slip'
import { saveDuelMetadata, type StoredDuelMetadata } from '../lib/relayer'
import { useEscrowTx } from '../lib/useTx'
import { entryFee, winningsFor } from '../lib/duels'
import { describeUiError } from '../lib/uiErrors'

const CATEGORY = 'Custom'

/** Price duels are judged against Coinbase's public spot price API, which GenLayer can fetch reliably. */
const COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
]

type Direction = 'above' | 'below'

function priceTerms(symbol: string, direction: Direction, target: string) {
  const coin = COINS.find((c) => c.symbol === symbol) ?? COINS[0]
  const value = Number(target)
  const exact = String(value)
  const shown = value.toLocaleString('en-US', { maximumFractionDigits: 8 })
  const opposite = direction === 'above' ? 'or below' : 'or above'
  return {
    claim: `Will ${coin.name} (${coin.symbol}) be ${direction} $${shown} when this duel ends?`,
    rules:
      `The Coinbase spot price API is read right after the duel ends; that reading is the ${coin.symbol}-USD price at the end time. ` +
      `YES if it shows an amount ${direction} ${exact}. NO if it shows ${exact} ${opposite}.`,
    evidence: `https://api.coinbase.com/v2/prices/${coin.symbol}-USD/spot`,
  }
}

const DURATIONS = [
  ...(isMainnet ? [] : [{ label: '10 min', seconds: 600 }]),
  { label: '1 hour', seconds: 3_600 },
  { label: '1 day', seconds: 86_400 },
  { label: '1 week', seconds: 604_800 },
]

const SOURCE_TYPES = ['official website', 'official docs', 'GitHub issue', 'GitHub release', 'encyclopedia', 'verified public announcement']

export function Create() {
  const navigate = useNavigate()
  const { address } = useAccount()
  const { data: balance } = useBalance({ address, chainId: arcChainId })
  const tx = useEscrowTx()

  const [mode, setMode] = useState<'custom' | 'price'>('custom')
  const [customClaim, setClaim] = useState('')
  const [customRules, setRules] = useState('')
  const [customEvidence, setEvidence] = useState('')
  const [coin, setCoin] = useState(COINS[0].symbol)
  const [direction, setDirection] = useState<Direction>('above')
  const [target, setTarget] = useState('')

  const targetValid = Number(target) > 0
  const price = mode === 'price' && targetValid ? priceTerms(coin, direction, target) : undefined
  const claim = mode === 'price' ? (price?.claim ?? '') : customClaim
  const rules = mode === 'price' ? (price?.rules ?? '') : customRules
  const evidence = mode === 'price' ? (price?.evidence ?? '') : customEvidence
  const category = mode === 'price' ? 'Crypto' : CATEGORY
  const [side, setSide] = useState<DuelSide>('YES')
  const [stake, setStake] = useState('5')
  const [duration, setDuration] = useState<number | 'custom'>(DURATIONS[0].seconds)
  const [customEnd, setCustomEnd] = useState('')
  const [saveError, setSaveError] = useState<string>()
  const [unsaved, setUnsaved] = useState<StoredDuelMetadata>()

  const committed = useMemo(() => {
    const evidenceUrls = evidence.split('\n').map((u) => u.trim()).filter(Boolean)
    return {
      claim: claim.trim(),
      resolutionRules: rules.trim(),
      evidenceUrls,
      allowedSourceTypes: SOURCE_TYPES,
      // The host allowlist is committed with the evidence, so the resolver can
      // refuse any out-of-policy fetch deterministically.
      allowedDomains: deriveAllowedDomains(evidenceUrls),
      category,
    }
  }, [claim, rules, evidence, category])

  const stakeWei = useMemo(() => {
    try {
      return parseEther(stake || '0')
    } catch {
      return 0n
    }
  }, [stake])

  const endSeconds =
    duration === 'custom' ? Math.floor(new Date(customEnd).getTime() / 1000) : Math.floor(Date.now() / 1000) + duration

  const problems = [
    mode === 'price' && !targetValid && 'Set a target price above 0.',
    committed.claim.length < 10 && 'Write a claim of at least 10 characters.',
    committed.resolutionRules.length < 10 && 'Say exactly what counts as YES and NO.',
    evidencePolicyError(committed),
    stakeWei <= 0n && 'Set a stake above 0.',
    balance && stakeWei + entryFee(stakeWei) > balance.value && `You have ${usdc(balance.value)} USDC — not enough for this stake plus fee.`,
    (!Number.isFinite(endSeconds) || endSeconds <= Date.now() / 1000 + 60) && 'Pick an end time at least a minute away.',
  ].filter(Boolean) as string[]

  async function saveMetadata(record: StoredDuelMetadata) {
    try {
      await saveDuelMetadata(record)
      setUnsaved(undefined)
      navigate(`/duel/${record.duelId}?new=1`)
    } catch (error) {
      setUnsaved(record)
      setSaveError(describeUiError(error))
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (problems.length) return
    setSaveError(undefined)
    const metadataHash = duelMetadataHash(committed)
    const expiry = BigInt(endSeconds)
    const receipt = await tx.send(
      'Creating your duel',
      'createDuel',
      [side === 'YES' ? 1 : 2, stakeWei, expiry, metadataHash],
      stakeWei + entryFee(stakeWei),
    )
    if (!receipt) return
    const [created] = parseEventLogs({ abi: wagrDuelEscrowAbi, eventName: 'DuelCreated', logs: receipt.logs })
    if (!created) return setSaveError('The duel was created but its ID could not be read. Check My duels.')
    await saveMetadata({
      ...committed,
      chainId: arcChainId,
      duelId: created.args.duelId.toString(),
      expiryTime: new Date(endSeconds * 1000).toISOString(),
      creatorSide: side,
      counterpartySide: side === 'YES' ? 'NO' : 'YES',
      metadataHash,
    })
  }

  return (
    <div className="create">
      <form className="card slip-form" onSubmit={submit}>
        <div>
          <p className="kicker">New wager slip</p>
          <h1 className="page-title">Start a duel</h1>
          <p className="muted">Make a call someone will disagree with. The terms lock onchain the moment you stake.</p>
        </div>

        <fieldset className="clause">
          <legend>
            <span className="clause-n">01</span> The claim
          </legend>
          <div className="tabs" role="tablist" aria-label="Kind of duel">
            {(
              [
                ['custom', 'Write your own'],
                ['price', 'Price bet'],
              ] as const
            ).map(([m, label]) => (
              <button type="button" role="tab" key={m} aria-selected={mode === m} className={`tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'custom' ? (
            <textarea
              className="claim-input"
              rows={2}
              value={customClaim}
              onChange={(e) => setClaim(e.target.value)}
              aria-label="The claim"
            />
          ) : (
            <>
              <div className="field">
                <span className="label">Coin</span>
                <div className="chips">
                  {COINS.map((c) => (
                    <button type="button" key={c.symbol} className={`chip ${coin === c.symbol ? 'active' : ''}`} onClick={() => setCoin(c.symbol)}>
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <span className="label">Price will be</span>
                  <div className="chips">
                    {(['above', 'below'] as const).map((d) => (
                      <button type="button" key={d} className={`chip ${direction === d ? 'active' : ''}`} onClick={() => setDirection(d)}>
                        {d === 'above' ? 'Above' : 'Below'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span className="label">Target price</span>
                  <div className="input-suffix">
                    <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Target price" />
                    <span>USD</span>
                  </div>
                </label>
              </div>
              {price && <p className="claim-input">{price.claim}</p>}
            </>
          )}
        </fieldset>

        <fieldset className="clause">
          <legend>
            <span className="clause-n">02</span> How it's judged
          </legend>
          {mode === 'custom' ? (
            <>
              <label className="field">
                <small className="hint">Spell out what counts as YES and what counts as NO. The AI follows these rules exactly.</small>
                <textarea rows={3} value={customRules} onChange={(e) => setRules(e.target.value)} aria-label="Resolution rules" />
              </label>
              <label className="field">
                <span className="label">Evidence links</span>
                <small className="hint">Public https pages the AI reads when time is up. One per line, up to 5.</small>
                <textarea rows={2} className="mono small" value={customEvidence} onChange={(e) => setEvidence(e.target.value)} />
              </label>
            </>
          ) : (
            <p className="hint">
              When time is up, the AI reads the live {coin}-USD price from Coinbase&apos;s public price feed
              {price ? ` and checks it against $${Number(target).toLocaleString('en-US', { maximumFractionDigits: 8 })}` : ''}. Set the end
              time below to the moment you mean.
            </p>
          )}
        </fieldset>

        <fieldset className="clause">
          <legend>
            <span className="clause-n">03</span> Your side
          </legend>
          <div className="side-toggle">
            {(['YES', 'NO'] as const).map((s) => (
              <button
                type="button"
                key={s}
                aria-pressed={side === s}
                className={`side-btn side-${s.toLowerCase()} ${side === s ? 'active' : ''}`}
                onClick={() => setSide(s)}
              >
                <span className="side-btn-word">{s}</span>
                <small>{s === 'YES' ? 'It will happen' : "It won't"}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="clause">
          <legend>
            <span className="clause-n">04</span> Stake &amp; deadline
          </legend>
          <div className="grid-2">
            <label className="field">
              <span className="label">Your stake</span>
              <div className="input-suffix">
                <input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))} />
                <span>USDC</span>
              </div>
              <small className="hint">
                One or many takers can match it, in any amounts. Fully matched, you win{' '}
                <strong>{stakeWei > 0n ? usdc(winningsFor(stakeWei)) : '—'} USDC</strong>.
              </small>
            </label>
            <div className="field">
              <span className="label">Ends in</span>
              <div className="chips">
                {DURATIONS.map((d) => (
                  <button type="button" key={d.label} className={`chip ${duration === d.seconds ? 'active' : ''}`} onClick={() => setDuration(d.seconds)}>
                    {d.label}
                  </button>
                ))}
                <button type="button" className={`chip ${duration === 'custom' ? 'active' : ''}`} onClick={() => setDuration('custom')}>
                  Pick a time
                </button>
              </div>
              {duration === 'custom' && <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />}
            </div>
          </div>
        </fieldset>

        {problems.length > 0 && (customClaim || customEvidence || target) && <p className="hint neg">{problems[0]}</p>}
        <TxNotice state={tx.state} onClose={tx.reset} />
        {saveError && (
          <div className="notice neg">
            <p>Your duel is onchain, but saving its terms to the relayer failed: {saveError}</p>
            {unsaved && (
              <button type="button" className="btn btn-line" onClick={() => saveMetadata(unsaved)}>
                Try again
              </button>
            )}
          </div>
        )}

        {address ? (
          <button className={`btn btn-lg btn-side side-fill-${side.toLowerCase()}`} disabled={problems.length > 0 || tx.busy}>
            {tx.busy ? 'Confirm in your wallet…' : `Stake ${stakeWei > 0n ? usdc(stakeWei) : ''} USDC on ${side}`}
          </button>
        ) : (
          <div className="row gap wrap">
            <span className="muted">Connect a wallet to stake.</span>
            <WalletButton />
          </div>
        )}
      </form>

      <aside className="create-preview">
        <p className="kicker">Preview</p>
        <div className="ticket ticket-static">
          <div className="ticket-stub">
            <span className="stub-label">No.</span>
            <span className="stub-no">····</span>
            <span className="phase phase-open">Draft</span>
          </div>
          <div className="ticket-main">
            <div className="ticket-meta">
              <span className="tag">{category}</span>
              <span className="mono">{stakeWei > 0n ? usdc(stakeWei) : '—'} USDC a side</span>
            </div>
            <p className="ticket-claim">{claim || 'Your claim appears here.'}</p>
            <div className="ticket-foot">
              <div className="corners">
                {(['YES', 'NO'] as const).map((s) => (
                  <Corner key={s} side={s} who={s === side ? 'you' : undefined} me="you" />
                ))}
              </div>
              <div className="ticket-pot">
                <span className="pot-label">Max pot</span>
                <span className="pot-amount">{stakeWei > 0n ? usdc(stakeWei * 2n) : '—'}</span>
                <span className="pot-unit">USDC</span>
              </div>
            </div>
          </div>
        </div>
        <dl className="preview-facts">
          <dt>You pay</dt>
          <dd className="mono">
            {usdc(stakeWei + entryFee(stakeWei))} USDC <span className="muted">(incl. {usdc(entryFee(stakeWei))} fee)</span>
          </dd>
          <dt>Ends</dt>
          <dd>{Number.isFinite(endSeconds) ? formatDate(endSeconds) : '—'}</dd>
          <dt>Evidence</dt>
          <dd>
            {committed.evidenceUrls.length} link{committed.evidenceUrls.length === 1 ? '' : 's'}
          </dd>
        </dl>
        <p className="hint">
          Fee: 0.5% when you stake, 0.5% of the winnings. If only part of your stake is matched by the end, the duel runs on what
          was matched and the rest comes back to you. If nobody takes it, cancel and get your stake back.
        </p>
      </aside>
    </div>
  )
}
