import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { wagrDuelEscrowAbi } from '@wagr/shared'
import { useAccount, usePublicClient } from 'wagmi'
import { Slip } from '../components/Slip'
import { WalletButton } from '../components/WalletButton'
import { arcChainId, escrowAddress } from '../lib/arc'
import { isParticipant, phaseOf, useDuels, type DuelRecord } from '../lib/duels'

export function MyDuels() {
  const { address } = useAccount()
  const { records, isLoading } = useDuelsFor(address)
  const claimable = useClaimableAmounts(records, address)

  if (!address)
    return (
      <div className="empty pad">
        <h1 className="page-title">My duels</h1>
        <p className="muted">Connect your wallet to see the duels you're in.</p>
        <WalletButton />
      </div>
    )

  const toClaim = records.filter((r) => (claimable[r.id] ?? 0n) > 0n)
  const rest = records.filter((r) => !toClaim.includes(r))

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="kicker">Your slips</p>
          <h1 className="page-title">My duels</h1>
        </div>
      </div>
      {isLoading && <p className="muted">Loading…</p>}
      {toClaim.length > 0 && (
        <section className="stack-sm claim-box">
          <h2 className="section-title">Ready to claim</h2>
          <div className="tickets">
            {toClaim.map((r) => (
              <Slip key={r.id} record={r} me={address} />
            ))}
          </div>
        </section>
      )}
      {rest.length > 0 ? (
        <div className="tickets">
          {rest.map((r) => (
            <Slip key={r.id} record={r} me={address} />
          ))}
        </div>
      ) : (
        !isLoading &&
        toClaim.length === 0 && (
          <div className="empty">
            <p className="empty-title">You haven't joined any duels yet.</p>
            <Link className="link" to="/duels">
              Find an open seat →
            </Link>
          </div>
        )
      )}
    </div>
  )
}

function useDuelsFor(address?: string): { records: DuelRecord[]; isLoading: boolean } {
  const { records, isLoading } = useDuels()
  return { isLoading, records: records.filter((r) => r.chain && isParticipant(r.chain, address)) }
}

/** `claimable` for each settled duel the wallet is in, keyed by duel id. */
function useClaimableAmounts(records: DuelRecord[], address?: string): Record<string, bigint> {
  const client = usePublicClient({ chainId: arcChainId })
  const settled = records.filter((r) => r.chain && ['settled', 'refund'].includes(phaseOf(r.chain)))
  const results = useQueries({
    queries: settled.map((r) => ({
      queryKey: ['claimable', r.id, address],
      queryFn: async () =>
        client && escrowAddress && address
          ? ((await client.readContract({
              address: escrowAddress,
              abi: wagrDuelEscrowAbi,
              functionName: 'claimable',
              args: [BigInt(r.id), address as `0x${string}`],
            })) as bigint)
          : 0n,
      refetchInterval: 15_000,
    })),
  })
  return Object.fromEntries(settled.map((r, i) => [r.id, results[i]?.data ?? 0n]))
}
