import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Slip } from '../components/Slip'
import { phaseOf, useDuels } from '../lib/duels'

const TERMS = [
  {
    n: '1',
    title: 'Call it',
    body: 'Write a yes-or-no claim, pick your side, set your stake in USDC and when it ends. Your stake goes into escrow on Arc.',
  },
  {
    n: '2',
    title: 'Get matched',
    body: 'Send the link to whoever thinks you’re wrong. One person can match your whole stake, or several can each take a piece until it’s full.',
  },
  {
    n: '3',
    title: 'AI judges, winner takes all',
    body: 'When time’s up, GenLayer validators read the public evidence and agree on a verdict. Winners claim the pot. Fees: 0.5% to enter, 0.5% of winnings.',
  },
]

export function Home() {
  const { address } = useAccount()
  const { records } = useDuels()
  const open = records.filter((r) => r.chain && phaseOf(r.chain) === 'open').slice(0, 3)
  const recent = open.length ? open : records.slice(0, 3)

  return (
    <div className="stack-xl">
      <section className="hero">
        <div className="hero-copy">
          <h1 className="poster poster-brand">Wagr</h1>
          <p className="kicker kicker-lg">Peer-to-peer prediction duels · USDC on Arc</p>
          <p className="lede">
            No house, no odds, no bookie. You make a call, someone takes the other side, and an AI reads the public evidence to
            decide who was right.
          </p>
          <div className="row gap wrap">
            <Link to="/new" className="btn btn-ink btn-lg">
              Start a duel
            </Link>
            <Link to="/duels" className="btn btn-line btn-lg">
              Find an open seat
            </Link>
          </div>
        </div>
        <HeroSlip />
      </section>

      <section className="terms">
        <div className="section-head">
          <h2 className="section-title">How a duel works</h2>
          <span className="rule" />
        </div>
        <ol className="terms-list">
          {TERMS.map((t) => (
            <li key={t.n}>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {recent.length > 0 && (
        <section className="stack-md">
          <div className="section-head">
            <h2 className="section-title">{open.length ? 'Open seats' : 'Latest duels'}</h2>
            <span className="rule" />
            <Link to="/duels" className="link">
              See all →
            </Link>
          </div>
          <div className="tickets">
            {recent.map((r) => (
              <Slip key={r.id} record={r} me={address} />
            ))}
          </div>
        </section>
      )}

      <section className="nohouse">
        <h2 className="poster poster-sm">
          There is <em>no house.</em>
        </h2>
        <div className="nohouse-grid">
          <div>
            <strong>Nobody holds the money</strong>
            <span>Both stakes sit in an escrow contract on Arc until the verdict is final. Not us, not a bookie.</span>
          </div>
          <div>
            <strong>Judged by consensus</strong>
            <span>GenLayer validators each read the evidence. Two of three independent signers must agree before Arc accepts it.</span>
          </div>
          <div>
            <strong>Always a way out</strong>
            <span>Either side can challenge a verdict. If none ever arrives, both stakes are refunded after 7 days.</span>
          </div>
        </div>
      </section>
    </div>
  )
}

/** Illustrative slip: what a matched duel looks like. */
function HeroSlip() {
  return (
    <div className="hero-slip" aria-hidden>
      <div className="hs-top">
        <span>WAGR · No. 0042</span>
        <span>Ends Dec 31</span>
      </div>
      <p className="hs-claim">“Will Arc hit $100B total TVL by December?”</p>
      <div className="hs-faceoff">
        <div className="hs-side hs-yes">
          <span className="hs-word">YES</span>
          <span className="hs-who">0x2BC4…935d</span>
        </div>
        <span className="vs">vs</span>
        <div className="hs-side hs-no">
          <span className="hs-word">NO</span>
          <span className="hs-who">0xB0eE…6418</span>
        </div>
      </div>
      <div className="hs-pot">
        <span>Pot</span>
        <strong>20.00</strong>
        <span>USDC</span>
      </div>
      <div className="hs-foot">winner takes all</div>
      <span className="stamp stamp-yes stamp-lg hs-stamp">YES wins</span>
    </div>
  )
}
