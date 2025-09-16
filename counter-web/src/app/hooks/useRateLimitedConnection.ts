'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, TransactionConfirmationStrategy, Commitment } from '@solana/web3.js';
import { useCallback } from 'react';
import { globalRequestQueue } from '../utils/requestQueue';

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export function useRateLimitedConnection() {
  const { connection } = useConnection();

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const withRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> => {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 5000 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isRateLimit = error.message?.includes('429') ||
                           error.message?.includes('Too many requests') ||
                           error.code === 429;

        if (!isRateLimit || attempt === maxRetries) {
          throw error;
        }

        const delayTime = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        console.log(`Server responded with 429. Retrying after ${delayTime}ms delay...`);
        await delay(delayTime);
      }
    }

    throw new Error('Max retries exceeded');
  }, []);

  const getLatestBlockhash = useCallback(
    (commitment?: Commitment) =>
      globalRequestQueue.add(() =>
        withRetry(() => connection.getLatestBlockhash(commitment || 'confirmed'))
      ),
    [connection, withRetry]
  );

  const confirmTransaction = useCallback(
    (signature: string | TransactionConfirmationStrategy, commitment?: Commitment) =>
      globalRequestQueue.add(() =>
        withRetry(() => connection.confirmTransaction(signature as any, commitment || 'confirmed'))
      ),
    [connection, withRetry]
  );

  const getAccountInfo = useCallback(
    (publicKey: PublicKey, commitment?: Commitment) =>
      globalRequestQueue.add(() =>
        withRetry(() => connection.getAccountInfo(publicKey, commitment || 'confirmed'))
      ),
    [connection, withRetry]
  );

  const requestAirdrop = useCallback(
    (publicKey: PublicKey, lamports: number) =>
      globalRequestQueue.add(async () => {
        try {
          return await withRetry(() => connection.requestAirdrop(publicKey, lamports));
        } catch (primaryError: any) {
          const msg = primaryError?.message || '';
          const isProjectRateLimit = msg.includes('Rate limit exceeded') || msg.includes('403');
          if (!isProjectRateLimit) throw primaryError;

          // Fallback to public Devnet faucet endpoint
          const fallback = new Connection('https://api.devnet.solana.com', 'confirmed');
          try {
            return await withRetry(() => fallback.requestAirdrop(publicKey, lamports));
          } catch (fallbackError) {
            throw primaryError; // preserve original error context
          }
        }
      }),
    [connection, withRetry]
  );

  return {
    connection,
    getLatestBlockhash,
    confirmTransaction,
    getAccountInfo,
    requestAirdrop,
  };
}