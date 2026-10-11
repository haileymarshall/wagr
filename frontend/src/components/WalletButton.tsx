import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EIP1193Provider } from 'viem'
import { useAccount, useBalance, useConnect, useDisconnect, useReconnect, useSwitchChain, type Connector } from 'wagmi'
import { arc, arcChainId, isMainnet } from '../lib/arc'
import { shortAddress, usdc } from '../lib/format'
import { wagmiConfig } from '../lib/wagmi'

const KNOWN_WALLETS = [
  { name: 'MetaMask', match: 'metamask', url: 'https://metamask.io/download/' },
  { name: 'Rabby Wallet', match: 'rabby', url: 'https://rabby.io/' },
  { name: 'Phantom', match: 'phantom', url: 'https://phantom.com/download' },
  { name: 'Coinbase Wallet', match: 'coinbase', url: 'https://www.coinbase.com/wallet/downloads' },
]

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors } = useConnect()
  const { reconnectAsync } = useReconnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: balance } = useBalance({ address, chainId: arcChainId })
  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  // Plain eth_requestAccounts, then let wagmi pick the session up. wagmi's own
  // connect() leads with wallet_requestPermissions, which Rabby rejects outright.
  async function connectWith(connector: Connector) {
    setPending(true)
    setError(undefined)
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider | undefined
      if (!provider) throw new Error(`${connector.name} not found`)
      await provider.request({ method: 'eth_requestAccounts' })
      await wagmiConfig.storage?.removeItem(`${connector.id}.disconnected`)
      await wagmiConfig.storage?.setItem('injected.connected', true)
      await reconnectAsync({ connectors: [connector] })
      setPicker(false)
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
    } finally {
      setPending(false)
    }
  }

  if (!isConnected) {
    return (
      <>
        <button className="btn btn-ink" onClick={() => setPicker(true)} disabled={pending}>
          {pending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {picker && (
          <WalletPicker connectors={connectors} pending={pending} error={error} onPick={connectWith} onClose={() => setPicker(false)} />
        )}
      </>
    )
  }

  if (chainId !== arcChainId) {
    return (
      <button className="btn btn-money" onClick={() => switchChain({ chainId: arcChainId })} disabled={switching}>
        {switching ? 'Switching…' : `Switch to ${arc.name}`}
      </button>
    )
  }

  return (
    <div className="wallet">
      <button className="wallet-chip" onClick={() => setMenu((v) => !v)}>
        <span className="dot" />
        <span className="mono">{shortAddress(address)}</span>
        {balance && <span className="wallet-bal mono">{usdc(balance.value)} USDC</span>}
      </button>
      {menu && (
        <div className="menu" onMouseLeave={() => setMenu(false)}>
          {!isMainnet && (
            <a className="menu-item" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              Get test USDC ↗
            </a>
          )}
          <button className="menu-item" onClick={() => navigator.clipboard?.writeText(address ?? '')}>
            Copy address
          </button>
          <button className="menu-item danger" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

function WalletPicker(props: {
  connectors: readonly Connector[]
  pending: boolean
  error?: string
  onPick: (c: Connector) => void
  onClose: () => void
}) {
  const { connectors, pending, error, onPick, onClose } = props
  const [others, setOthers] = useState(false)
  const announced = connectors.filter((c) => c.id !== 'injected')
  const detected = announced.length > 0 ? announced : 'ethereum' in window ? connectors : []
  const missing = KNOWN_WALLETS.filter((w) => !detected.some((c) => c.name.toLowerCase().includes(w.match)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          {others ? (
            <button className="link" onClick={() => setOthers(false)}>
              ← Back
            </button>
          ) : (
            <strong>Connect a wallet</strong>
          )}
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {!others ? (
          <>
            {detected.map((c) => (
              <button key={c.uid} className="picker-row" disabled={pending} onClick={() => onPick(c)}>
                {c.icon ? <img src={c.icon} alt="" /> : <span className="picker-icon">◎</span>}
                <span className="grow">{c.id === 'injected' ? 'Browser wallet' : c.name}</span>
                <small>Detected</small>
              </button>
            ))}
            <button className="picker-row" onClick={() => setOthers(true)}>
              <span className="picker-icon">＋</span>
              <span className="grow">Other wallets</span>
              <small>›</small>
            </button>
          </>
        ) : missing.length ? (
          missing.map((w) => (
            <a key={w.name} className="picker-row" href={w.url} target="_blank" rel="noreferrer">
              <span className="grow">{w.name}</span>
              <small>Install ↗</small>
            </a>
          ))
        ) : (
          <p className="picker-note">All supported wallets are already installed.</p>
        )}
        {(pending || error) && <p className={`picker-note ${error && !pending ? 'neg' : ''}`}>{pending ? 'Approve the request in your wallet…' : error}</p>}
      </div>
    </div>,
    document.body,
  )
}
