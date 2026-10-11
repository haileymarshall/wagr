import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { wagrDuelEscrowAbi } from '@wagr/shared'
import type { TransactionReceipt } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { arcChainId, arcFees, escrowAddress } from './arc'
import { describeUiError, logUiError } from './uiErrors'

type EscrowFunction =
  | 'createDuel'
  | 'acceptDuel'
  | 'cancelOpenDuel'
  | 'challengeVerdict'
  | 'claim'
  | 'finalizeVerdict'
  | 'finalizeChallenge'
  | 'markResolutionTimedOut'

export interface TxState {
  label?: string
  status: 'idle' | 'signing' | 'confirming' | 'done' | 'error'
  hash?: `0x${string}`
  error?: string
}

/** Send one escrow call on Arc: switch network if needed, sign, wait, refresh. */
export function useEscrowTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: arcChainId })
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>({ status: 'idle' })

  async function send(
    label: string,
    functionName: EscrowFunction,
    args: readonly unknown[],
    value?: bigint,
  ): Promise<TransactionReceipt | undefined> {
    if (!escrowAddress || !client) {
      setState({ status: 'error', label, error: 'Wagr is not deployed on this network yet.' })
      return
    }
    try {
      setState({ status: 'signing', label })
      if (chainId !== arcChainId) await switchChainAsync({ chainId: arcChainId })
      const hash = await writeContractAsync({
        chainId: arcChainId,
        address: escrowAddress,
        abi: wagrDuelEscrowAbi,
        functionName,
        args,
        value,
        ...arcFees,
        // One helper serves every escrow function, so the per-function overloads can't narrow here.
      } as unknown as Parameters<typeof writeContractAsync>[0])
      setState({ status: 'confirming', label, hash })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('transaction reverted')
      setState({ status: 'done', label, hash })
      void queryClient.invalidateQueries()
      return receipt
    } catch (error) {
      logUiError(label, error)
      setState((s) => ({ ...s, status: 'error', error: describeUiError(error) }))
    }
  }

  return { state, send, busy: state.status === 'signing' || state.status === 'confirming', reset: () => setState({ status: 'idle' }) }
}
