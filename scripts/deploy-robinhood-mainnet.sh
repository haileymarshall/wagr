#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${ROBINHOOD_MAINNET_RPC_URL:=https://rpc.mainnet.chain.robinhood.com}"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env}"
: "${OWNER_ADDRESS:?Set OWNER_ADDRESS in .env}"
: "${WAGR_ATTESTERS:?Set WAGR_ATTESTERS in .env}"
: "${WAGR_ATTESTER_THRESHOLD:?Set WAGR_ATTESTER_THRESHOLD in .env}"
: "${WAGR_CHALLENGE_WINDOW_SECONDS:?Set WAGR_CHALLENGE_WINDOW_SECONDS in .env}"
: "${WAGR_RESOLUTION_GRACE_SECONDS:?Set WAGR_RESOLUTION_GRACE_SECONDS in .env}"

if [[ ! "$DEPLOYER_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed private key" >&2
  exit 1
fi

if [[ ! "$OWNER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "OWNER_ADDRESS must be a valid 0x-prefixed EVM address" >&2
  exit 1
fi

echo "WARNING: this will deploy WagrDuelEscrow to Robinhood Chain mainnet using real ETH for gas."
read -r -p "Type DEPLOY ROBINHOOD MAINNET to continue: " confirmation
if [ "$confirmation" != "DEPLOY ROBINHOOD MAINNET" ]; then
  echo "Canceled."
  exit 1
fi

cmd=(
  forge script
  script/DeployWagrDuelEscrow.s.sol:DeployWagrDuelEscrow
  --rpc-url "$ROBINHOOD_MAINNET_RPC_URL"
  --broadcast
)

if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
  cmd+=(--verify --verifier blockscout --verifier-url "https://api.robinhoodchain.blockscout.com/api")
fi

cd contracts/base
"${cmd[@]}"
