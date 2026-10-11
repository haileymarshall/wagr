import { txUrl } from '../lib/arc'
import type { TxState } from '../lib/useTx'

export function TxNotice({ state, onClose }: { state: TxState; onClose: () => void }) {
  if (state.status === 'idle') return null
  const text =
    state.status === 'signing'
      ? `${state.label} — confirm in your wallet…`
      : state.status === 'confirming'
        ? `${state.label} — confirming on Arc…`
        : state.status === 'done'
          ? `${state.label} — done.`
          : state.error
  return (
    <div className={`notice ${state.status === 'error' ? 'neg' : state.status === 'done' ? 'pos' : ''}`}>
      <span className="grow">{text}</span>
      {state.hash && (
        <a className="link mono small" href={txUrl(state.hash)} target="_blank" rel="noreferrer">
          view tx ↗
        </a>
      )}
      {(state.status === 'done' || state.status === 'error') && (
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  )
}
