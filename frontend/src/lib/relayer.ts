import type { DuelMetadata, DuelSide, GenLayerVerdict } from '@wagr/shared'
import { arcChainId, relayerUrl } from './arc'

export interface StoredDuelMetadata extends DuelMetadata {
  chainId: number
  duelId: string
  expiryTime: string
  creatorSide: DuelSide
  counterpartySide: DuelSide
  metadataHash: `0x${string}`
}

export interface StoredResolution {
  duelId: string
  verdict: GenLayerVerdict
  genlayerTxHash?: `0x${string}`
  attesters?: `0x${string}`[]
  baseSubmitted: boolean
  baseTxHash?: `0x${string}`
  createdAt: string
}

export interface AutoResolveStatus {
  enabled: boolean
  pending: { genlayerTxHash: `0x${string}`; submittedAt: string; attempts: number; lastError?: string } | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${relayerUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Relayer request failed with HTTP ${response.status}`)
  return data as T
}

export const listDuelMetadata = () => request<{ items: StoredDuelMetadata[] }>(`/metadata?chainId=${arcChainId}`)

export const getDuelMetadata = (duelId: string) => request<StoredDuelMetadata>(`/metadata/${duelId}?chainId=${arcChainId}`)

export const saveDuelMetadata = (metadata: StoredDuelMetadata) =>
  request<StoredDuelMetadata>('/metadata', { method: 'POST', body: JSON.stringify(metadata) })

export async function getResolution(duelId: string): Promise<StoredResolution | null> {
  try {
    return await request<StoredResolution>(`/resolution/${duelId}?chainId=${arcChainId}`)
  } catch {
    return null
  }
}

export async function getAutoResolveStatus(duelId: string): Promise<AutoResolveStatus | null> {
  try {
    return await request<AutoResolveStatus>(`/auto-resolve/${duelId}?chainId=${arcChainId}`)
  } catch {
    return null
  }
}
