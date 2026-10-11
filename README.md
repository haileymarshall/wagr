# Wagr

**Two people. One bet. Settled in USDC on Arc, judged by GenLayer.**

Wagr is a peer-to-peer prediction duel app. Someone makes a YES/NO call and
stakes USDC on it; anyone who disagrees takes the other side. When time is up,
GenLayer's AI validators read the public evidence named in the duel and decide
the outcome. The winner is paid out of an escrow on Arc. There is no house, no
order book and no AMM: just two sides of one bet.

## What Arc is used for

- **USDC-native stakes.** On Arc, USDC is the native gas token, so a duel is
  staked, settled and paid in dollars with no wrapping and no second token.
- **The escrow.** `WagrDuelEscrow` on Arc holds every stake, matches takers,
  accepts only quorum-signed verdicts, runs the challenge window and pays out.
- **Cheap, fast settlement.** Sub-cent fees and sub-second finality make small
  bets (a dollar or less) practical.
- **One wallet, one network.** Players only ever sign Arc transactions. The
  relayer drives GenLayer resolution from its own account, so nobody switches
  networks or holds a second token.

## How a duel works

1. **Create.** The creator writes a claim, the rules for YES and NO, and 1–5
   evidence links, picks a side, a stake and an end time. The terms are hashed
   and committed onchain with the stake. Or pick **Price bet**: choose a coin,
   above/below and a target, and the claim, rules and evidence (Coinbase's
   public spot price API) are filled in automatically.
2. **Take.** Any number of takers fill the opposite side in any amounts, until
   the creator's stake is matched. At expiry the duel runs on what was matched;
   the creator's unmatched remainder is refunded.
3. **Resolve.** At expiry the relayer marks resolution requested on Arc and
   sends `resolve_duel` to the GenLayer resolver. GenLayer validators fetch the
   committed evidence and reach consensus on YES, NO or no decision.
4. **Attest.** Once the GenLayer transaction is FINALIZED, 2 of 3 independent
   attesters re-check everything and sign the verdict (EIP-712). The relayer
   submits it to Arc.
5. **Challenge window.** The verdict waits a challenge window. A participant
   can challenge, which then requires every attester to agree.
6. **Claim.** Winners claim the pot; if the duel is void, everyone claims a
   full refund of their matched stake.

**Fees:** 0.5% of every deposit on entry, plus 0.5% of the matched stake at
payout (winners only). A void duel refunds matched stakes in full.

## Architecture

| Part | Path | What it does |
| --- | --- | --- |
| Escrow | `contracts/base` | Foundry project. `WagrDuelEscrow.sol`: stakes, pooled takers, fees, quorum verdicts, challenge, timeout refund |
| Resolver | `genlayer/contracts/wagr_resolver.py` | GenLayer intelligent contract that fetches the evidence and adjudicates the duel |
| Relayer | `relayer` | Stores duel terms, auto-resolves expired duels via GenLayer, collects attestations, pays Arc gas |
| Shared | `shared` | Chains, ABI and the canonical metadata / duel-state encodings |
| Frontend | `frontend` | Vite + React + wagmi app |

## Networks

| Network | Chain ID | Escrow |
| --- | ---: | --- |
| Arc Testnet | `5042002` | `0xf587d9a28293e062870c73A731F10Aa1f100088A` |
| Arc Mainnet | `5042` | _deploying_ |

GenLayer resolver (StudioNet): `0xdeA0CBCc78CeE4fa43066EE096EC30B3913f4031`

## Trust model

**The committed wager.** `metadataHash` is `sha256` over a length-prefixed
encoding of the claim, rules, evidence URLs, source types, allowed domains and
category (`shared/src/duelMetadata.ts`, mirrored in the resolver). The relayer,
the GenLayer resolver and the escrow each check it independently, so nobody can
make GenLayer judge a different claim than the one that was staked on. Evidence
must be `https`, 1–5 URLs, and every host must be in the committed allowlist;
out-of-policy evidence resolves INVALID without a single fetch.

**The authenticated duel data.** The resolver recomputes a hash over the chain
ID, escrow, duel ID, participants, side, stake, expiry and metadata hash, and
attesters compare it with `WagrDuelEscrow.duelStateHash(duelId)` read live from
Arc. Every Arc-derived input the model sees is bound to what the escrow holds.
Resolution before expiry is rejected on both GenLayer and Arc.

**Verdict authorization.** Arc does not trust the relayer key: it only pays
gas. A verdict needs an EIP-712 quorum of attester signatures over the duel,
verdict, metadata hash, duel-state hash, verdict hash and GenLayer transaction
hash, bound to one chain and one escrow. Attesters wait for GenLayer
FINALIZED, not ACCEPTED.

**Safety valves.** A challenged verdict needs every attester to sign, or the
duel is voided and refunded. If no verdict ever arrives, both sides can refund
after a grace period (7 days).

**Known limits.** Two attesters run as separate services under one hosting
account, and the third key is held offline; that defeats a single compromised
process, not a compromised account. There is no trustless GenLayer→Arc proof;
the quorum plus challenge window is the strongest available construction.

## Tests

```bash
npm test
```

```bash
npm run relayer:test      # 34: commitment enforcement, quorum, attester behaviour
npm run contracts:test    # 56: escrow lifecycle, pooled takers, fees, quorum, challenge, timeout, fuzzed conservation
npm run genlayer:test     # 91: resolver binding, metadata mutation, source policy (offline GenVM stub)
npm run verify:encodings  # TypeScript, Python and Solidity encodings agree
```

## Local setup

```bash
npm install
npm run build
npm test
npm run dev:relayer    # http://localhost:8787
npm run dev:frontend   # http://localhost:5173
```

Copy `.env.example` to `.env` and fill in local values. Never commit `.env`.

## Deploying

```bash
WAGR_ATTESTERS=0xattester1,0xattester2,0xattester3
WAGR_ATTESTER_THRESHOLD=2
npm run deploy:arc-testnet
npm run deploy:arc-mainnet
```

- **Relayer + attester:** `render.yaml` (Render Blueprint) defines the relayer,
  a second attester and a Postgres database for duel terms. Secrets
  (`ARC_RELAYER_PRIVATE_KEY`, `GENLAYER_ACCOUNT_PRIVATE_KEY`,
  `WAGR_ATTESTER_PRIVATE_KEY`, `WAGR_ATTESTER_AUTH_TOKEN`,
  `WAGR_ATTESTER_ENDPOINTS`) are set in the Render dashboard.
- **Frontend:** Vercel from the repo root (`vercel.json`). Set `VITE_ARC_NETWORK`
  (`testnet` / `mainnet`), `VITE_ARC_TESTNET_ESCROW_ADDRESS` or
  `VITE_ARC_MAINNET_ESCROW_ADDRESS`, and `VITE_RELAYER_URL`.
- **Resolver:** `npm run genlayer:deploy` (only when the resolver changes).

Regenerate the shared ABI whenever the contract changes: `npm run contracts:abi`.
