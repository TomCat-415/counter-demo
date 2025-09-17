'use client';

import React, { useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, Connection } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

// Simple connection factory with longer timeouts
function createConnectionWithTimeouts(endpoint: string): Connection {
	return new Connection(endpoint, {
		commitment: 'confirmed',
		confirmTransactionInitialTimeout: 180_000,
	});
}

export default function AppWalletProvider({ children }: { children: React.ReactNode }) {
	const fallbackEndpoint = clusterApiUrl(WalletAdapterNetwork.Devnet);
	const configured = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL as string) || fallbackEndpoint;

	// Normalize endpoint for SSR safety
	const normalizedEndpoint = useMemo(() => {
		if (configured.startsWith('/')) {
			if (typeof window !== 'undefined') return `${window.location.origin}${configured}`;
			return 'https://api.devnet.solana.com';
		}
    return configured;
	}, [configured]);

	// Create a dedicated Connection instance (used for health check)
	const connection = useMemo(() => createConnectionWithTimeouts(normalizedEndpoint), [normalizedEndpoint]);

  // Explicit WebSocket endpoint (no key). Stops ws://localhost derivation and errors
  const wsEndpoint = useMemo(() => {
    const envWs = process.env.NEXT_PUBLIC_SOLANA_WS_URL as string | undefined;
    return envWs || 'wss://api.devnet.solana.com';
  }, []);

	// Lightweight health check (non-blocking)
	useEffect(() => {
		connection.getVersion().catch((e: unknown) => {
			const msg = (e as { message?: string } | undefined)?.message || e;
			console.warn('RPC health check failed for:', normalizedEndpoint, msg);
		});
	}, [connection, normalizedEndpoint]);

	// Always include Phantom/Solflare adapters (defighter-style)
	const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={normalizedEndpoint} config={{ commitment: 'confirmed', wsEndpoint, confirmTransactionInitialTimeout: 180000 }}>
			<WalletProvider wallets={wallets} autoConnect={false}>
				<WalletModalProvider>{children}</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
}