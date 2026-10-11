import { createConfig, http, type Transport } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { arc, rpcUrl } from './arc'

// Installed wallets announce themselves via EIP-6963; `injected` is the fallback.
export const wagmiConfig = createConfig({
  chains: [arc],
  connectors: [injected()],
  transports: { [arc.id]: http(rpcUrl) } as Record<typeof arc.id, Transport>,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
