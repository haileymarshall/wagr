import type { GenLayerVerdict } from '@wagr/shared'
import { addressUrl, genlayerTxUrl } from '../lib/arc'
import { shortAddress } from '../lib/format'
import { Stamp } from './Slip'

export function VerdictCard({
  verdict,
  genlayerTxHash,
  attesters,
}: {
  verdict: GenLayerVerdict
  genlayerTxHash?: string
  attesters?: string[]
}) {
  const call = verdict.verdict === 'UNRESOLVED' ? 'INVALID' : verdict.verdict
  return (
    <section className="card verdict">
      <div className="verdict-head">
        <div>
          <p className="kicker">The ruling</p>
          <p className="verdict-by">GenLayer validators · {verdict.confidence}% confident</p>
        </div>
        <Stamp verdict={call} size="lg" />
      </div>
      {verdict.reasoning && <p className="verdict-reason">{verdict.reasoning}</p>}
      {verdict.invalid_reason && <p className="muted">{verdict.invalid_reason}</p>}
      {verdict.sources_checked?.length > 0 && (
        <div className="stack-xs">
          <span className="label">Sources read</span>
          <ul className="sources">
            {verdict.sources_checked.map((s) => (
              <li key={s.url}>
                <a className="link mono small" href={s.url} target="_blank" rel="noreferrer">
                  {s.url}
                </a>
                <span className="muted small">
                  {' '}
                  · {s.status} · supports {s.supports}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="verdict-proof">
        {genlayerTxHash && (
          <a className="link" href={genlayerTxUrl(genlayerTxHash)} target="_blank" rel="noreferrer">
            GenLayer transaction ↗
          </a>
        )}
        {attesters?.map((a, i) => (
          <a key={a} className="link mono" href={addressUrl(a)} target="_blank" rel="noreferrer">
            signer {i + 1} · {shortAddress(a)}
          </a>
        ))}
      </div>
    </section>
  )
}
