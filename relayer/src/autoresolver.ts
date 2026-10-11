import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  authenticatedDuelDataHash,
  settlementChainIds,
  type AuthenticatedDuelData,
  type BaseChainId,
} from '@wagr/shared'
import { settleDuel, type RelayerAppDeps } from './app.js'
import { toCommittedMetadata } from './attestation.js'
import type { EscrowAction } from './base.js'

/**
 * Drives every expired duel to settlement without either participant touching
 * GenLayer: request resolution on the escrow, send `resolve_duel` from the
 * relayer's own GenLayer account, collect the attester quorum once GenLayer
 * finalizes, and finalize after the challenge window. Every step is one the
 * escrow already allows anyone to take, so this adds no new authority.
 */
export interface AutoResolverDeps extends RelayerAppDeps {
  sendEscrowAction(config: RelayerAppDeps['config'], chainId: BaseChainId, action: EscrowAction, duelId: bigint): Promise<`0x${string}`>
  submitResolveToGenLayer(
    config: RelayerAppDeps['config'],
    duel: AuthenticatedDuelData,
    metadata: ReturnType<typeof toCommittedMetadata>,
  ): Promise<`0x${string}`>
}

export interface PendingResolution {
  genlayerTxHash: `0x${string}`
  duelDataHash: `0x${string}`
  submittedAt: string
  attempts: number
  lastError?: string
}

const MAX_GENLAYER_ATTEMPTS = 3

export function createAutoResolver(deps: AutoResolverDeps, pendingFile = process.env.WAGR_AUTO_RESOLVE_FILE || '.wagr-autoresolve.json') {
  const { config, storage } = deps
  const pending = new Map<string, PendingResolution>(loadPending(pendingFile))
  const inFlight = new Set<string>()
  const log = (key: string, message: string) => console.log(`[auto-resolve ${key}] ${message}`)

  const persist = () => writeFileSync(pendingFile, `${JSON.stringify(Object.fromEntries(pending), null, 2)}\n`)

  const activeChains = settlementChainIds.filter(
    (chainId) =>
      config.baseNetworks[chainId]?.escrowAddress && (config.relayerPrivateKeys?.[chainId] || config.relayerPrivateKey),
  )

  async function step(chainId: BaseChainId, duelId: string) {
    const key = `${chainId}:${duelId}`
    const duel = await deps.readDuelFromBase(config, chainId, BigInt(duelId))
    const now = Math.floor(Date.now() / 1000)

    switch (duel.status) {
      case 'Active': {
        if (now < Number(duel.expiry)) return
        const hash = await deps.sendEscrowAction(config, chainId, 'markResolutionRequested', BigInt(duelId))
        log(key, `resolution requested on escrow: ${hash}`)
        return
      }
      case 'ResolutionRequested': {
        const metadata = await storage.getMetadata(chainId, duelId)
        if (!metadata) return
        const duelDataHash = authenticatedDuelDataHash(duel)
        let entry = pending.get(key)

        if (!entry || entry.duelDataHash !== duelDataHash) {
          if (entry && entry.attempts >= MAX_GENLAYER_ATTEMPTS) return
          const genlayerTxHash = await deps.submitResolveToGenLayer(config, duel, toCommittedMetadata(metadata))
          entry = {
            genlayerTxHash,
            duelDataHash,
            submittedAt: new Date().toISOString(),
            attempts: (entry?.attempts ?? 0) + 1,
          }
          pending.set(key, entry)
          persist()
          log(key, `resolve_duel sent to GenLayer: ${genlayerTxHash}`)
        }

        // Waits for GenLayer finality inside the attesters; can take a while.
        const result = await settleDuel(deps, chainId, duelId, entry.genlayerTxHash)
        if (result.status === 200 && result.body.baseSubmitted) {
          log(key, `verdict submitted: ${String(result.body.baseTxHash)}`)
          pending.delete(key)
        } else {
          entry.lastError = String(result.body.error ?? result.body.baseSubmitError ?? 'not submitted')
          log(key, `settlement not complete: ${entry.lastError}`)
        }
        persist()
        return
      }
      case 'VerdictProposed':
        await tryAction(chainId, duelId, 'finalizeVerdict')
        return
      case 'Challenged':
        await tryAction(chainId, duelId, 'finalizeChallenge')
        return
      default:
        return
    }
  }

  async function tryAction(chainId: BaseChainId, duelId: string, action: EscrowAction) {
    try {
      const hash = await deps.sendEscrowAction(config, chainId, action, BigInt(duelId))
      log(`${chainId}:${duelId}`, `${action}: ${hash}`)
    } catch {
      // Simulation reverts until the window closes; nothing to do yet.
    }
  }

  async function tick() {
    for (const chainId of activeChains) {
      const items = await storage.listMetadata(chainId)
      for (const item of items) {
        const key = `${chainId}:${item.duelId}`
        if (inFlight.has(key)) continue
        inFlight.add(key)
        step(chainId, item.duelId)
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            const entry = pending.get(key)
            if (entry) {
              entry.lastError = message
              persist()
            }
            log(key, `error: ${message.split('\n')[0]}`)
          })
          .finally(() => inFlight.delete(key))
      }
    }
  }

  return {
    activeChains,
    tick,
    status(chainId: BaseChainId, duelId: string) {
      return pending.get(`${chainId}:${duelId}`)
    },
    start(intervalMs = config.autoResolveIntervalMs ?? 30_000) {
      if (!config.genlayerAccountPrivateKey || activeChains.length === 0) {
        console.log('Auto-resolver disabled: needs GENLAYER_ACCOUNT_PRIVATE_KEY, an escrow address and a relayer key')
        return
      }
      console.log(`Auto-resolver watching chains ${activeChains.join(', ')} every ${intervalMs / 1000}s`)
      const run = () => tick().catch((error) => console.error('[auto-resolve] tick failed', error))
      run()
      setInterval(run, intervalMs)
    },
  }
}

function loadPending(file: string): [string, PendingResolution][] {
  if (!existsSync(file)) return []
  try {
    return Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, PendingResolution>)
  } catch {
    return []
  }
}

