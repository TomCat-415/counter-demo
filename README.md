# Solana Counter (Anchor program + Next.js dApp)

This repo contains:
- An Anchor program that stores a `u64` counter (deployed to Solana Devnet)
- A Next.js web dApp that connects Phantom, creates a counter account, and increments it

Program (Devnet)
- Program ID: `2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1`
- Explorer: https://explorer.solana.com/address/2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1?cluster=devnet
- IDL: `target/idl/counter.json`

## Prerequisites
- Node 20+
- Solana CLI (`solana --version`)
- Phantom wallet (enable Test networks and switch to Solana Devnet)

Optional (for Anchor local building):
- Anchor CLI 0.31.x

## Quick start (web dApp)
1) Point CLI to Devnet and (optionally) fund your wallet for testing:

```
solana config set --url https://api.devnet.solana.com
# Airdrop to your Phantom public key if needed
# solana airdrop 1 YOUR_PHANTOM_PUBLIC_KEY --url https://api.devnet.solana.com
```

2) Run the app locally:

```
cd counter-web
npm install
npm run dev
# open http://localhost:3000
```

3) In the app:
- Open Phantom → Settings → Developer Settings → enable “Show test networks” → switch to Solana Devnet
- Click “Select Wallet” and approve
- (Optional) Click “Airdrop 1 SOL (Devnet)”
- Click “Create Counter” then “Increment Counter”

## Deploy (Vercel)

From the web app directory:

```
cd counter-web
npx vercel@latest deploy --prod
```

Share the Production URL shown by the CLI (…vercel.app). If a login prompt appears for viewers, in Vercel go to:
- Project → Settings → Deployment Protection → Authentication → set to “Preview Deployments only” or “Disabled”

Note: You generally do not need to disable “Build Logs and Source Protection”. Keep it enabled unless you have a specific reason.

## CLI demo scripts (optional)

Run end‑to‑end without the web dApp:

```
nvm use 20
yarn install
node scripts/init_counter.js   # creates and initializes a counter
node scripts/demo.js           # init + increment + readback
```

Expected output includes tx signatures and values (0 after init, 1 after increment). See `assets/demo-output.png`.

## Troubleshooting
- “Simulation reverted” warning in Phantom: ensure network is Devnet and use the latest build. The client pre‑signs the created account.
- Hydration errors: all wallet UI is client‑only; hard refresh if you see a stale build.

## About the two READMEs
- This file (`counter/README.md`) covers the whole project: Anchor program, scripts, and the web dApp including deploy steps.
- `counter/counter-web/README.md` is the default Next.js template readme and can be ignored for this project.

## Notes
- Do **not** commit keypairs (see `.gitignore`). Your Devnet key lives at `~/code/solana/devnet.json`.
- Built with Anchor 0.31.1, Next.js 15, React 19.
