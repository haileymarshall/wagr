import { defineChain } from 'viem'

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://sepolia.base.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://sepolia.basescan.org',
    },
  },
  testnet: true,
})

export const baseMainnet = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://mainnet.base.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://basescan.org',
    },
  },
})

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Explorer',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
})

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  // Arc's native gas token is USDC (18 decimals at the native layer).
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://explorer.testnet.arc.io',
    },
  },
  testnet: true,
})

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://explorer.arc.io',
    },
  },
})

export const settlementChainIds = [arcTestnet.id, arcMainnet.id, robinhoodMainnet.id, baseSepolia.id, baseMainnet.id] as const
export type SettlementChainId = (typeof settlementChainIds)[number]
/** Backward-compatible name retained while the codebase is migrated to multi-chain settlement. */
export type BaseChainId = SettlementChainId

export const baseChainIds = settlementChainIds
export const baseOnlyChainIds = [baseSepolia.id, baseMainnet.id] as const

export const baseChains = {
  [arcTestnet.id]: arcTestnet,
  [arcMainnet.id]: arcMainnet,
  [robinhoodMainnet.id]: robinhoodMainnet,
  [baseSepolia.id]: baseSepolia,
  [baseMainnet.id]: baseMainnet,
} as const

export const settlementChains = baseChains

export const baseChainNames = {
  [arcTestnet.id]: 'Arc Testnet',
  [arcMainnet.id]: 'Arc',
  [robinhoodMainnet.id]: 'Robinhood Chain',
  [baseSepolia.id]: 'Base Sepolia',
  [baseMainnet.id]: 'Base Mainnet',
} as const

export const settlementChainNames = baseChainNames

export const baseChainSlugs = {
  [arcTestnet.id]: 'arcTestnet',
  [arcMainnet.id]: 'arcMainnet',
  [robinhoodMainnet.id]: 'robinhoodMainnet',
  [baseSepolia.id]: 'baseSepolia',
  [baseMainnet.id]: 'baseMainnet',
} as const

export const settlementChainSlugs = baseChainSlugs

export function isSupportedBaseChainId(chainId: number): chainId is BaseChainId {
  return baseChainIds.includes(chainId as BaseChainId)
}

export function isBaseOnlyChainId(chainId: number): chainId is (typeof baseOnlyChainIds)[number] {
  return baseOnlyChainIds.includes(chainId as (typeof baseOnlyChainIds)[number])
}

export function getBaseChain(chainId: BaseChainId) {
  return baseChains[chainId]
}

export const isSupportedSettlementChainId = isSupportedBaseChainId
export const getSettlementChain = getBaseChain

export const genlayerStudioNet = {
  chainId: 61999,
  name: 'GenLayer StudioNet',
  rpcUrl: 'https://studio.genlayer.com/api',
  websocketUrl: 'wss://studio.genlayer.com',
} as const

export const WAGR_TAGLINE = 'PvP prediction battles resolved by GenLayer.'
