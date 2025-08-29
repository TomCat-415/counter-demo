'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton, WalletModalButton, WalletConnectButton } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('2esiwqpYjizvnSQBFcvo5cSNbgzpPVfTW2ew24YUiHj1');

// Instruction discriminators from your IDL
const DISC_INIT = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const DISC_INCR = Buffer.from([11, 18, 104, 9, 104, 174, 59, 33]);
const ACC_DISC = Buffer.from([255, 176, 4, 245, 188, 253, 124, 25]);

export default function Counter() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected, wallets } = useWallet();
  const [counter, setCounter] = useState<Keypair | null>(null);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error reading counter:', message);
      return null;
    }
  }, [connection]);

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

      // Fetch a recent blockhash before partially signing
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // The counter account must sign because it is created as a signer in the instruction
      tx.partialSign(newCounter);

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      
      setCounter(newCounter);
      setCounterValue(0);
      setStatus('Counter initialized! 🎉');
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Initialize error:', message);
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, connection, sendTransaction]);

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
      
      // Read the new value
      const newValue = await readCounterValue(counter.publicKey);
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
  }, [publicKey, connected, counter, connection, sendTransaction, readCounterValue]);

  const airdropOneSol = useCallback(async () => {
    if (!publicKey || !connected) return;

    setIsLoading(true);
    setStatus('Requesting 1 SOL airdrop on Devnet...');

    try {
      const signature = await connection.requestAirdrop(publicKey, 1_000_000_000);
      await connection.confirmTransaction(signature, 'confirmed');
      setStatus('Airdrop complete! ✅');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Airdrop error:', message);
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, connection]);

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
              Counter: {counter.publicKey.toString()}
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
          </div>
        )}
      </div>
    </div>
  );
}