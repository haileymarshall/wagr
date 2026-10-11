import { serve } from '@hono/node-server'
import { createRelayerApp } from './app.js'
import { createAutoResolver } from './autoresolver.js'
import { readAttesterThreshold, readDuelFromBase, sendEscrowAction, submitVerdictToBase, verdictHash } from './base.js'
import { loadConfig } from './config.js'
import { readResolutionFromGenLayer, submitResolveToGenLayer } from './genlayer.js'
import { getMetadata, getResolution, listMetadata, saveMetadata, saveResolution } from './storage.js'

const config = loadConfig()
const deps = {
  config,
  readResolutionFromGenLayer,
  readDuelFromBase,
  readAttesterThreshold,
  storage: {
    getMetadata,
    getResolution,
    listMetadata,
    saveMetadata,
    saveResolution,
  },
  submitVerdictToBase,
  verdictHash,
}
const app = createRelayerApp(deps)

const autoResolver = createAutoResolver({ ...deps, sendEscrowAction, submitResolveToGenLayer })
// Lets the app show where an expired duel is in the automatic resolution flow.
app.get('/auto-resolve/:duelId', (c) => {
  const chainId = Number(c.req.query('chainId'))
  const entry = autoResolver.status(chainId as Parameters<typeof autoResolver.status>[0], c.req.param('duelId'))
  return c.json({ enabled: Boolean(config.autoResolve && config.genlayerAccountPrivateKey), pending: entry ?? null })
})
if (config.autoResolve) autoResolver.start()

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Wagr relayer listening on port ${info.port}`)
  },
)
