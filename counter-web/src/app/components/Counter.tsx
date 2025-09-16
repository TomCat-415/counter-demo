'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRateLimitedConnection } from '../hooks/useRateLimitedConnection';
import { WalletMultiButton, WalletModalButton, WalletConnectButton, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1');

// Instruction discriminators from your IDL
const DISC_INIT = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const DISC_INCR = Buffer.from([11, 18, 104, 9, 104, 174, 59, 33]);
const ACC_DISC = Buffer.from([255, 176, 4, 245, 188, 253, 124, 25]);

export default function Counter() {
  const { connection, getLatestBlockhash, confirmTransaction, getAccountInfo, requestAirdrop } = useRateLimitedConnection();
  const { publicKey, sendTransaction: walletSendTransaction, signTransaction, connected, wallets } = useWallet();
  const { setVisible } = useWalletModal();
  const [counter, setCounter] = useState<PublicKey | null>(null);
  const [counterValue, setCounterValue] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Ensure certain UI only renders on the client to avoid hydration mismatch
    setIsClient(true);
  }, []);

  const hasReadyWallet = useMemo(() => {
    // Show connect button only when a wallet is installed/loadable; otherwise open modal
    return wallets.some(w => 
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable
    );
  }, [wallets]);

  const readCounterValue = useCallback(async (counterPubkey: PublicKey) => {
    try {
      const info = await getAccountInfo(counterPubkey, 'confirmed');
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error reading counter:', message);
      return null;
    }
  }, [getAccountInfo]);

  const initializeCounter = useCallback(async () => {
    if (!publicKey || !connected) return;
    
    setIsLoading(true);
    setStatus('Creating new counter...');
    
    try {
      // Ensure sufficient balance for rent + fees
      const rentLamports = await connection.getMinimumBalanceForRentExemption(8 + 8, 'confirmed');
      const balance = await connection.getBalance(publicKey, 'confirmed');
      if (balance < rentLamports + 5_000) {
        setStatus('Insufficient funds for rent. Use Airdrop 1 SOL and retry.');
        return;
      }

      // Derive PDA for the counter
      const [counterPda] = PublicKey.findProgramAddressSync([Buffer.from('counter')], PROGRAM_ID);

      // If already initialized, just load it
      const existing = await getAccountInfo(counterPda, 'confirmed');
      if (existing) {
        setCounter(counterPda);
        const val = await readCounterValue(counterPda);
        if (val !== null) setCounterValue(val);
        setStatus('Counter already exists; loaded current value.');
        return;
      }

      const ixInit = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: counterPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: DISC_INIT,
      });

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ixInit,
      );
      tx.feePayer = publicKey;

      // Fetch a recent blockhash before sending
      const { blockhash, lastValidBlockHeight } = await getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;

      // Let the wallet sign and surface errors; we'll simulate on failure below

      try {
        let signature: string;
        if (signTransaction) {
          const signed = await signTransaction(tx);
          const raw = signed.serialize();
          console.log('Initialize raw tx bytes:', raw.length);
          signature = await connection.sendRawTransaction(raw, { preflightCommitment: 'confirmed' });
        } else {
          signature = await walletSendTransaction(tx, connection, { preflightCommitment: 'confirmed' });
        }
        await confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      } catch (e: any) {
        console.error('WalletSendTransactionError message:', e?.message);
        console.error('cause:', e?.cause || e?.originalError);
        if (e?.logs) console.error('logs:', e.logs);
        try {
          const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
          console.error('Sim logs:', sim.value.logs);
          console.error('Sim err:', sim.value.err);
        } catch {}
        throw e;
      }
      
      setCounter(counterPda);
      setCounterValue(0);
      setStatus('Counter initialized! 🎉');
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Initialize error:', message);
      console.error('Initialize error object:', err);
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, connection, walletSendTransaction, getLatestBlockhash, confirmTransaction]);

  const incrementCounter = useCallback(async () => {
    if (!publicKey || !connected || !counter) return;
    
    setIsLoading(true);
    setStatus('Incrementing counter...');
    
    try {
      const ixIncr = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: counter, isSigner: false, isWritable: true }
        ],
        data: DISC_INCR,
      });

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ixIncr,
      );
      tx.feePayer = publicKey;
      
      const { blockhash, lastValidBlockHeight } = await getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;

      // Let the wallet sign and surface errors; we'll simulate on failure below

      try {
        let signature: string;
        if (signTransaction) {
          const signed = await signTransaction(tx);
          const raw = signed.serialize();
          console.log('Increment raw tx bytes:', raw.length);
          signature = await connection.sendRawTransaction(raw, { preflightCommitment: 'confirmed' });
        } else {
          signature = await walletSendTransaction(tx, connection, { preflightCommitment: 'confirmed' });
        }
        await confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      } catch (e: any) {
        console.error('WalletSendTransactionError message:', e?.message);
        console.error('cause:', e?.cause || e?.originalError);
        if (e?.logs) console.error('logs:', e.logs);
        try {
          const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
          console.error('Sim logs:', sim.value.logs);
          console.error('Sim err:', sim.value.err);
        } catch {}
        throw e;
      }
      
      // Read the new value
      const newValue = await readCounterValue(counter);
      if (newValue !== null) {
        setCounterValue(newValue);
      }
      
      setStatus('Counter incremented! ✨');
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Increment error:', message);
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, counter, connection, walletSendTransaction, getLatestBlockhash, confirmTransaction, readCounterValue]);

  const airdropOneSol = useCallback(async () => {
    if (!publicKey || !connected) return;

    setIsLoading(true);
    setStatus('Requesting 1 SOL airdrop on Devnet...');

    try {
      const signature = await requestAirdrop(publicKey, 1_000_000_000);
      await confirmTransaction(signature, 'confirmed');
      setStatus('Airdrop complete! ✅');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Airdrop error:', message);
      console.error('Airdrop error object:', err);
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, requestAirdrop, confirmTransaction]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold uppercase tracking-wider mb-2">
            SOLANA COUNTER
          </h1>
          <p className="text-gray-400">Live on Devnet</p>
        </div>

        {/* Counter Display */}
        <div className="bg-gray-800 border border-teal-400 rounded-none p-8 text-center">
          <div className="text-sm uppercase tracking-wider text-gray-400 mb-2">
            Current Count
          </div>
          <div className="text-6xl font-mono font-bold text-teal-400 mb-4">
            {counterValue}
          </div>
          {counter && (
            <div className="text-xs text-gray-500 break-all">
              Counter: {counter.toString()}
            </div>
          )}
        </div>

        {/* Wallet Connection */}
        <div className="space-y-4">
          <div className="wallet-adapter-button-trigger flex justify-center" suppressHydrationWarning>
            {isClient ? (
              !connected ? (
                <WalletConnectButton className="!bg-teal-500 hover:!bg-teal-600 !rounded-none !border-none !font-bold !uppercase !tracking-wider !h-12 !px-8" />
              ) : null
            ) : (
              <button className="bg-teal-500 text-white font-bold py-3 px-8 uppercase tracking-wider opacity-60" disabled>
                Loading Wallet...
              </button>
            )}
          </div>
          
          {!connected && (
            <div className="text-center text-sm text-gray-400">
              <p>Need a wallet? <a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 underline">Install Phantom</a></p>
            </div>
          )}
          
          {connected && (
            <button
              onClick={airdropOneSol}
              disabled={isLoading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 uppercase tracking-wider transition-colors duration-200 disabled:cursor-not-allowed"
            >
              Airdrop 1 SOL (Devnet)
            </button>
          )}

          {connected && !counter && (
            <button
              onClick={initializeCounter}
              disabled={isLoading}
              className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 text-white font-bold py-3 px-6 uppercase tracking-wider transition-colors duration-200 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Counter'}
            </button>
          )}
          
          {connected && counter && (
            <button
              onClick={incrementCounter}
              disabled={isLoading}
              className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 text-white font-bold py-3 px-6 uppercase tracking-wider transition-colors duration-200 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Increment Counter'}
            </button>
          )}
        </div>

        {/* Status */}
        {status && (
          <div className="text-center p-4 bg-gray-800 border border-gray-700">
            <p className={`text-sm ${status.includes('Error') ? 'text-red-400' : 'text-teal-400'}`}>
              {status}
            </p>
          </div>
        )}

        {/* Info */}
        {connected && (
          <div className="text-center text-xs text-gray-500 space-y-1">
            <p>Connected: {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}</p>
            <p>Network: Devnet</p>
            <button
              onClick={() => setVisible(true)}
              className="pt-2 mx-auto text-gray-400 hover:text-teal-300 underline"
            >
              Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}