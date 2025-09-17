'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, TransactionConfirmationStrategy, Commitment } from '@solana/web3.js';
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
      } catch (error: unknown) {
        const err = error as { message?: string; code?: number } | undefined;
        const isRateLimit = err?.message?.includes('429') ||
                           err?.message?.includes('Too many requests') ||
                           err?.code === 429;

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
      globalRequestQueue.add(async () => {
        const desiredCommitment: Commitment = commitment || 'confirmed';
        const sig = typeof signature === 'string' ? signature : signature.signature;
        const lastValidBlockHeight =
          typeof signature === 'string'
            ? undefined
            : ('lastValidBlockHeight' in signature
                ? (signature as TransactionConfirmationStrategy & { lastValidBlockHeight?: number }).lastValidBlockHeight
                : undefined);
        const startTime = Date.now();
        const timeoutMs = 180_000; // 3 minutes
        const pollIntervalMs = 1_000;
        let nextBlockHeightCheck = 0;

        for (;;) {
          // Optional: abort if past last valid block height
          const now = Date.now();
          if (lastValidBlockHeight !== undefined && now >= nextBlockHeightCheck) {
            const current = await withRetry(() => connection.getBlockHeight(desiredCommitment));
            if (current > lastValidBlockHeight) {
              throw new Error('Signature has expired: block height exceeded.');
            }
            nextBlockHeightCheck = now + 3_000; // check every 3s
          }

          const statusResp = await withRetry(() => connection.getSignatureStatuses([sig], { searchTransactionHistory: true }));
          const status = statusResp.value[0];
          if (status) {
            if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
              return { context: { slot: statusResp.context.slot }, value: status } as unknown as void;
            }
          }

          if (Date.now() - startTime > timeoutMs) {
            throw new Error('Confirmation timeout exceeded');
          }
          await delay(pollIntervalMs);
        }
      }),
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
        } catch (primaryError: unknown) {
          const msg = (primaryError as { message?: string } | undefined)?.message || '';
          const isProjectRateLimit = msg.includes('Rate limit exceeded') || msg.includes('403');
          if (!isProjectRateLimit) throw primaryError;

          // Fallback to public Devnet faucet endpoint
          const fallback = new Connection('https://api.devnet.solana.com', 'confirmed');
          try {
            return await withRetry(() => fallback.requestAirdrop(publicKey, lamports));
          } catch {
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