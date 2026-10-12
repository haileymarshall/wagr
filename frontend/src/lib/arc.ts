import { arcMainnet, arcTestnet } from '@wagr/shared'
import { isAddress } from 'viem'

/** Wagr on Arc runs on exactly one network, chosen at build time. */
export const isMainnet = import.meta.env.VITE_ARC_NETWORK === 'mainnet'
export const arc = isMainnet ? arcMainnet : arcTestnet
export const arcChainId = arc.id

export const rpcUrl =
  (isMainnet ? import.meta.env.VITE_ARC_MAINNET_RPC_URL : import.meta.env.VITE_ARC_TESTNET_RPC_URL) || arc.rpcUrls.default.http[0]

const rawEscrow = isMainnet ? import.meta.env.VITE_ARC_MAINNET_ESCROW_ADDRESS : import.meta.env.VITE_ARC_TESTNET_ESCROW_ADDRESS
export const escrowAddress = rawEscrow && isAddress(rawEscrow) ? (rawEscrow as `0x${string}`) : undefined

/** The same app built for the other Arc network, linked from the footer. */
export const otherSiteUrl = import.meta.env.VITE_OTHER_SITE_URL as string | undefined

export const relayerUrl = import.meta.env.VITE_RELAYER_URL || 'http://localhost:8787'
export const genlayerExplorer = 'https://explorer-studio.genlayer.com'

const explorer = arc.blockExplorers.default.url.replace(/\/$/, '')
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`
export const addressUrl = (address: string) => `${explorer}/address/${address}`
export const genlayerTxUrl = (hash: string) => `${genlayerExplorer}/tx/${hash}`

/** Arc rejects fees under its 20 gwei floor; pinning avoids under-priced wallet estimates. */
export const arcFees = { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n } as const
