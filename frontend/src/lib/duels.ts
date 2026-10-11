import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { duelStatusNames, wagrDuelEscrowAbi, type DuelSide, type DuelStatus } from '@wagr/shared'
import { zeroAddress } from 'viem'
import { usePublicClient } from 'wagmi'
import { arcChainId, escrowAddress } from './arc'
import { sameAddress } from './format'
import { getAutoResolveStatus, getDuelMetadata, getResolution, listDuelMetadata, type StoredDuelMetadata } from './relayer'

export type Verdict = 'None' | 'YES' | 'NO' | 'INVALID'
const verdictNames: Verdict[] = ['None', 'YES', 'NO', 'INVALID']

export interface ChainDuel {
  creator: `0x${string}`
  counterparty?: `0x${string}`
  creatorSide: DuelSide
  stake: bigint
  expiry: number
  metadataHash: `0x${string}`
  status: DuelStatus
  verdict: Verdict
  /** Sum of all takers' stakes on the opposite side. */
  matched: bigint
  takerCount: number
  /** Every taker and their stake, in join order. */
  takers: { address: `0x${string}`; stake: bigint }[]
  createdAt: number
  verdictProposedAt: number
  genlayerTxHash?: `0x${string}`
  confidenceBps: number
}

/**
 * One label per moment in a duel's life, derived from escrow state and time.
 * Everything the UI shows keys off this.
 */
export type Phase =
  | 'open' // the opposite side still has room, before expiry
  | 'live' // fully matched, waiting for expiry
  | 'judging' // expired; the relayer is getting GenLayer's verdict
  | 'verdict' // verdict proposed; challenge window open
  | 'challenged'
  | 'settled' // winner can claim
  | 'refund' // invalid; both can claim back
  | 'paid'
  | 'canceled'

export function phaseOf(duel: ChainDuel, nowMs = Date.now()): Phase {
  switch (duel.status) {
    case 'Open':
      return 'open'
    case 'Active':
      if (nowMs / 1000 >= duel.expiry) return 'judging'
      return duel.matched < duel.stake ? 'open' : 'live'
    case 'ResolutionRequested':
      return 'judging'
    case 'VerdictProposed':
      return 'verdict'
    case 'Challenged':
      return 'challenged'
    case 'Resolved':
      return 'settled'
    case 'Invalid':
      return 'refund'
    case 'Paid':
      return 'paid'
    default:
      return 'canceled'
  }
}

export const opposite = (side: DuelSide): DuelSide => (side === 'YES' ? 'NO' : 'YES')

/** Basis points, mirrored from `WagrDuelEscrow`. */
export const ENTRY_FEE_BPS = 50n
export const SETTLEMENT_FEE_BPS = 50n
export const entryFee = (amount: bigint) => (amount * ENTRY_FEE_BPS) / 10_000n
/** What a winning stake of `amount` pays out: both sides' `amount`, less 0.5% of each. */
export const winningsFor = (amount: bigint) => 2n * amount - (2n * amount * SETTLEMENT_FEE_BPS) / 10_000n

export const takerStakeOf = (duel: ChainDuel, address?: string) =>
  duel.takers.find((t) => sameAddress(t.address, address))?.stake ?? 0n

export function sideOf(duel: ChainDuel, address?: string): DuelSide | undefined {
  if (sameAddress(duel.creator, address)) return duel.creatorSide
  if (takerStakeOf(duel, address) > 0n) return opposite(duel.creatorSide)
  return undefined
}

export const isParticipant = (duel: ChainDuel, address?: string) => sideOf(duel, address) !== undefined

/** The side that won, once a YES/NO verdict exists. */
export function winningSide(duel: ChainDuel): DuelSide | undefined {
  return duel.verdict === 'YES' || duel.verdict === 'NO' ? duel.verdict : undefined
}

function normalize(raw: unknown, takersRaw?: readonly [readonly `0x${string}`[], readonly bigint[]]): ChainDuel | undefined {
  if (!raw) return undefined
  const obj = raw as Record<string, unknown>
  const arr = raw as readonly unknown[]
  const at = <T,>(key: string, i: number) => (obj[key] ?? arr[i]) as T
  const creator = at<`0x${string}`>('creator', 0)
  if (!creator || creator === zeroAddress) return undefined
  const counterparty = at<`0x${string}`>('counterparty', 1)
  const genlayerTxHash = at<`0x${string}`>('genlayerTxHash', 16)
  const [addresses = [], stakes = []] = takersRaw ?? []
  return {
    creator,
    counterparty: counterparty && counterparty !== zeroAddress ? counterparty : undefined,
    creatorSide: Number(at('creatorSide', 2)) === 2 ? 'NO' : 'YES',
    stake: at<bigint>('stakeAmount', 3) ?? 0n,
    expiry: Number(at<bigint>('expiry', 4) ?? 0n),
    metadataHash: at('metadataHash', 5),
    status: (duelStatusNames[Number(at('status', 6))] ?? 'Open') as DuelStatus,
    verdict: verdictNames[Number(at('verdict', 7))] ?? 'None',
    matched: at<bigint>('matchedAmount', 8) ?? 0n,
    takerCount: Number(at<bigint>('takerCount', 9) ?? 0n),
    takers: addresses.map((address, i) => ({ address, stake: stakes[i] ?? 0n })),
    createdAt: Number(at<bigint>('createdAt', 11) ?? 0n),
    verdictProposedAt: Number(at<bigint>('verdictProposedAt', 14) ?? 0n),
    genlayerTxHash: genlayerTxHash && !/^0x0+$/.test(genlayerTxHash) ? genlayerTxHash : undefined,
    confidenceBps: Number(at('confidenceBps', 17) ?? 0),
  }
}

function useReadDuel() {
  const client = usePublicClient({ chainId: arcChainId })
  return async (duelId: string) => {
    if (!client || !escrowAddress) return undefined
    const id = BigInt(duelId)
    const [raw, takers] = await Promise.all([
      client.readContract({ address: escrowAddress, abi: wagrDuelEscrowAbi, functionName: 'duels', args: [id] }),
      client.readContract({ address: escrowAddress, abi: wagrDuelEscrowAbi, functionName: 'getTakers', args: [id] }),
    ])
    return normalize(raw, takers)
  }
}

export interface DuelRecord {
  id: string
  metadata: StoredDuelMetadata
  chain?: ChainDuel
}

export function useDuels() {
  const readDuel = useReadDuel()
  const list = useQuery({ queryKey: ['duels'], queryFn: listDuelMetadata, refetchInterval: 20_000 })
  const items = list.data?.items ?? []
  const chains = useQueries({
    queries: items.map((m) => ({
      queryKey: ['duel', m.duelId],
      queryFn: () => readDuel(m.duelId),
      refetchInterval: 20_000,
    })),
  })
  const records = useMemo<DuelRecord[]>(
    () =>
      items
        .map((metadata, i) => ({ id: metadata.duelId, metadata, chain: chains[i]?.data }))
        .sort((a, b) => Number(b.id) - Number(a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, ...chains.map((c) => c.dataUpdatedAt)],
  )
  return { records, isLoading: list.isLoading, error: list.error }
}

export function useDuel(duelId: string | undefined) {
  const readDuel = useReadDuel()
  const metadata = useQuery({
    queryKey: ['metadata', duelId],
    queryFn: () => getDuelMetadata(duelId!),
    enabled: Boolean(duelId),
    retry: 1,
  })
  const chain = useQuery({
    queryKey: ['duel', duelId],
    queryFn: () => readDuel(duelId!),
    enabled: Boolean(duelId),
    refetchInterval: 8_000,
  })
  const phase = chain.data ? phaseOf(chain.data) : undefined
  const resolution = useQuery({
    queryKey: ['resolution', duelId],
    queryFn: () => getResolution(duelId!),
    enabled: Boolean(duelId) && phase !== undefined && !['open', 'live', 'canceled'].includes(phase),
    refetchInterval: 10_000,
  })
  const auto = useQuery({
    queryKey: ['auto-resolve', duelId],
    queryFn: () => getAutoResolveStatus(duelId!),
    enabled: Boolean(duelId) && phase === 'judging',
    refetchInterval: 8_000,
  })
  return { metadata, chain, resolution, auto, phase }
}

/** What `address` can collect from a settled duel right now. */
export function useClaimable(duelId: string | undefined, address: string | undefined, phase: Phase | undefined) {
  const client = usePublicClient({ chainId: arcChainId })
  return useQuery({
    queryKey: ['claimable', duelId, address],
    queryFn: async () =>
      client && escrowAddress
        ? ((await client.readContract({
            address: escrowAddress,
            abi: wagrDuelEscrowAbi,
            functionName: 'claimable',
            args: [BigInt(duelId!), address as `0x${string}`],
          })) as bigint)
        : 0n,
    enabled: Boolean(duelId && address) && (phase === 'settled' || phase === 'refund'),
    refetchInterval: 10_000,
  })
}

export function useChallengeWindow() {
  const client = usePublicClient({ chainId: arcChainId })
  return useQuery({
    queryKey: ['challenge-window'],
    queryFn: async () =>
      client && escrowAddress
        ? Number(await client.readContract({ address: escrowAddress, abi: wagrDuelEscrowAbi, functionName: 'challengeWindow' }))
        : 1800,
    staleTime: Infinity,
  })
}
