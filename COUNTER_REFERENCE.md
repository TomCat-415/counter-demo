# Counter.tsx – Working Reference (do not modify these parts)

This document snapshots the exact, currently working logic that powers the on‑chain counter in the web app. If future edits break the app, restore these sections in `counter-web/src/app/components/Counter.tsx`.

- Program ID: `2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1`
- Cluster: Devnet (wallet adapter uses `clusterApiUrl(WalletAdapterNetwork.Devnet)`)
- File: `counter-web/src/app/components/Counter.tsx`

## 1) Read counter value (browser‑safe parsing)

```
const readCounterValue = useCallback(async (counterPubkey: PublicKey) => {
  try {
    const info = await connection.getAccountInfo(counterPubkey, 'confirmed');
    if (!info) return null;

    const raw = info.data as unknown;
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
    const header = data.subarray(0, 8);
    const discriminatorMatches =
      header.length === ACC_DISC.length &&
      header.every((byte, idx) => byte === ACC_DISC[idx]);
    if (!discriminatorMatches) {
      throw new Error('Invalid counter account');
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const value = view.getBigUint64(8, true);
    return Number(value);
  } catch (err) {
    console.error('Error reading counter:', err instanceof Error ? err.message : String(err));
    return null;
  }
}, [connection]);
```

## 2) Initialize counter (current working path)

- Generates a new `Keypair` for the counter
- Builds an `initialize` instruction with both the counter and the user as signers
- Sets fee payer and recent blockhash
- Partially signs with the counter (so it’s a signer), then sends with `sendTransaction`

```
const initializeCounter = useCallback(async () => {
  if (!publicKey || !connected) return;

  setIsLoading(true);
  setStatus('Creating new counter...');

  try {
    const newCounter = Keypair.generate();

    const ixInit = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: newCounter.publicKey, isSigner: true, isWritable: true },
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DISC_INIT,
    });

    const tx = new Transaction().add(ixInit);
    tx.feePayer = publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    // Critical: the counter account must sign, since it's a signer in the instruction
    tx.partialSign(newCounter);

    const signature = await sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    setCounter(newCounter);
    setCounterValue(0);
    setStatus('Counter initialized! 🎉');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Initialize error:', message);
    setStatus(`Error: ${message}`);
  } finally {
    setIsLoading(false);
  }
}, [publicKey, connected, connection, sendTransaction]);
```

## 3) Increment counter (current working path)

```
const incrementCounter = useCallback(async () => {
  if (!publicKey || !connected || !counter) return;

  setIsLoading(true);
  setStatus('Incrementing counter...');

  try {
    const ixIncr = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: counter.publicKey, isSigner: false, isWritable: true }
      ],
      data: DISC_INCR,
    });

    const tx = new Transaction().add(ixIncr);
    tx.feePayer = publicKey;

    const signature = await sendTransaction(tx, connection);
    await connection.confirmTransaction(signature, 'confirmed');

    const newValue = await readCounterValue(counter.publicKey);
    if (newValue !== null) setCounterValue(newValue);

    setStatus('Counter incremented! ✨');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Increment error:', message);
    setStatus(`Error: ${message}`);
  } finally {
    setIsLoading(false);
  }
}, [publicKey, connected, counter, connection, sendTransaction, readCounterValue]);
```

## Notes and fallback
- If any wallet throws a generic error during initialize, a robust fallback is to replace `sendTransaction` with:
  1) `tx.partialSign(newCounter)` (keep)
  2) `const signed = await signTransaction(tx)`
  3) `connection.sendRawTransaction(signed.serialize())`
  4) confirm using the same `{ signature, blockhash, lastValidBlockHeight }`
- Only use that fallback if the simple path breaks; the above is your current working code.

## Quick verification commands
- Ensure this file’s snippets match the live code:
```
grep -n "partialSign(newCounter)" counter-web/src/app/components/Counter.tsx
```
- Check that no custom `signTransaction` flow is present:
```
grep -n "signTransaction(" counter-web/src/app/components/Counter.tsx || echo "OK: not present"
```

*End of reference*

