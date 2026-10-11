// End-to-end duel on Arc testnet: creates a duel from the deployer wallet,
// accepts it from a funded counterparty wallet, and registers the metadata
// with the relayer. The relayer's auto-resolver takes it from there.
//
//   node scripts/e2e-arc-testnet.mjs <counterpartyKeyFile> [expirySeconds]
//   E2E_METADATA_JSON='{...}' overrides the committed duel terms.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, duelMetadataHash, wagrDuelEscrowAbi } from '@wagr/shared'

const [counterpartyKeyFile, expiryArg] = process.argv.slice(2)
if (!counterpartyKeyFile) throw new Error('usage: e2e-arc-testnet.mjs <counterpartyKeyFile> [expirySeconds]')

const escrow = process.env.ARC_TESTNET_ESCROW_ADDRESS
const relayer = process.env.E2E_RELAYER_URL || 'http://localhost:8787'
const rpc = process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]
const stake = parseEther(process.env.E2E_STAKE || '0.5')
const fees = { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }

const creator = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY)
const counterparty = privateKeyToAccount(readFileSync(counterpartyKeyFile, 'utf8').trim())
const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
const wallet = (account) => createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })

const committed = process.env.E2E_METADATA_JSON ? JSON.parse(process.env.E2E_METADATA_JSON) : {
  claim: 'The English Wikipedia has an article titled "Bitcoin".',
  resolutionRules: 'YES if the evidence page is the English Wikipedia article about Bitcoin. NO otherwise.',
  evidenceUrls: ['https://en.wikipedia.org/wiki/Bitcoin'],
  allowedSourceTypes: ['Encyclopedia'],
  allowedDomains: ['en.wikipedia.org'],
  category: 'Test',
}
/** Mirrors `WagrDuelEscrow.entryFee` (0.5%). */
const entryFee = (amount) => (amount * 50n) / 10_000n
const metadataHash = duelMetadataHash(committed)
const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(expiryArg || 120))

console.log(`creator ${creator.address} · counterparty ${counterparty.address}`)
const createHash = await wallet(creator).writeContract({
  address: escrow,
  abi: wagrDuelEscrowAbi,
  functionName: 'createDuel',
  args: [1, stake, expiry, metadataHash],
  value: stake + entryFee(stake),
  ...fees,
})
const createReceipt = await pub.waitForTransactionReceipt({ hash: createHash })
const [created] = parseEventLogs({ abi: wagrDuelEscrowAbi, eventName: 'DuelCreated', logs: createReceipt.logs })
const duelId = created.args.duelId
console.log(`duel ${duelId} created: ${createHash}`)

// Fill the opposite side in two partial takes to exercise the pooled book.
const half = stake / 2n
for (const amount of [half, stake - half]) {
  const acceptHash = await wallet(counterparty).writeContract({
    address: escrow,
    abi: wagrDuelEscrowAbi,
    functionName: 'acceptDuel',
    args: [duelId, amount],
    value: amount + entryFee(amount),
    ...fees,
  })
  await pub.waitForTransactionReceipt({ hash: acceptHash })
  console.log(`duel ${duelId} took ${amount}: ${acceptHash}`)
}

const res = await fetch(`${relayer}/metadata`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chainId: arcTestnet.id,
    duelId: duelId.toString(),
    ...committed,
    expiryTime: new Date(Number(expiry) * 1000).toISOString(),
    creatorSide: 'YES',
    counterpartySide: 'NO',
    metadataHash,
  }),
})
console.log(`metadata → relayer: ${res.status} ${await res.text()}`)
console.log(`expires at ${new Date(Number(expiry) * 1000).toISOString()}`)
