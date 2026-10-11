#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${ARC_MAINNET_RPC_URL:=https://rpc.mainnet.arc.io}"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY in .env}"
: "${OWNER_ADDRESS:?Set OWNER_ADDRESS in .env}"
: "${WAGR_ATTESTERS:?Set WAGR_ATTESTERS in .env}"
: "${WAGR_ATTESTER_THRESHOLD:?Set WAGR_ATTESTER_THRESHOLD in .env}"
: "${WAGR_CHALLENGE_WINDOW_SECONDS:?Set WAGR_CHALLENGE_WINDOW_SECONDS in .env}"
: "${WAGR_RESOLUTION_GRACE_SECONDS:?Set WAGR_RESOLUTION_GRACE_SECONDS in .env}"

echo "WARNING: this will deploy WagrDuelEscrow to Arc mainnet using real USDC for gas."
read -r -p "Type DEPLOY ARC MAINNET to continue: " confirmation
if [ "$confirmation" != "DEPLOY ARC MAINNET" ]; then
  echo "Canceled."
  exit 1
fi

cd contracts/base
# Arc rejects fees below its 20 gwei floor; stakes and gas are native USDC.
forge script script/DeployWagrDuelEscrow.s.sol:DeployWagrDuelEscrow \
  --rpc-url "$ARC_MAINNET_RPC_URL" --broadcast --with-gas-price 30gwei --priority-gas-price 1gwei
