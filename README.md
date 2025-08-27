# Solana Counter Demo (Anchor + web3.js)

A tiny Anchor program (Counter) deployed to **devnet** plus a Node script that:
1) creates a new Counter account
2) calls `initialize` (value = 0)
3) calls `increment` (value = 1)

## Program
- Program ID (devnet): `2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1`
- IDL: `target/idl/counter.json`

## Run the demo script (devnet)

    nvm use 20
    yarn install
    node scripts/demo.js

### Expected

    initialize tx: <signature>
    After initialize: 0
    increment tx: <signature>
    After increment: 1

## Notes
- Do **not** commit keypairs (see `.gitignore`). Your devnet key lives at `~/code/solana/devnet.json`.
- Built with Anchor 0.31.1 and Node 20.
