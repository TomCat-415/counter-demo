'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Connection } from '@solana/web3.js';
import { DEVNET_ENDPOINTS, RpcEndpointManager } from '../utils/rpcEndpoints';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [endpointManager] = useState(() => new RpcEndpointManager(DEVNET_ENDPOINTS));
  const [endpoint, setEndpoint] = useState(() => endpointManager.getCurrentEndpoint().url);

  // Test endpoint health and switch if needed
  useEffect(() => {
    const testEndpointHealth = async () => {
      try {
        const connection = new Connection(endpoint, 'confirmed');
        await connection.getVersion(); // Simple health check
      } catch (error: unknown) {
        const err = error as { message?: string } | undefined;
        // Treat any network/CORS/429 error as a signal to switch endpoints
        console.log('Current endpoint unhealthy, switching...', err?.message || error);
        endpointManager.markEndpointAsFailed(endpoint);
        const newEndpoint = endpointManager.switchToNextEndpoint();
        setEndpoint(newEndpoint.url);
      }
    };

    testEndpointHealth();
  }, [endpoint, endpointManager]);
  
  // Use Wallet Standard discovery; avoid registering specific wallet adapters like Phantom to prevent duplicates
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}