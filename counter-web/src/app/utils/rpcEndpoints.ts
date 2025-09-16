import { clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

export interface RpcEndpoint {
  url: string;
  name: string;
  priority: number;
}

const CUSTOM_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
const HELIUS_INPUT = process.env.NEXT_PUBLIC_HELIUS_API_KEY?.trim();

// Accept either a full URL or a bare key for Helius
const HELIUS_URL = (() => {
  if (!HELIUS_INPUT) return undefined;
  if (HELIUS_INPUT.startsWith('http')) return HELIUS_INPUT;
  // treat as key
  return `https://devnet.helius-rpc.com/?api-key=${HELIUS_INPUT}`;
})();

export const DEVNET_ENDPOINTS: RpcEndpoint[] = [
  // Custom endpoint (recommended). Provide a CORS-enabled endpoint via env.
  ...(CUSTOM_RPC
    ? [{ url: CUSTOM_RPC, name: 'Custom RPC', priority: 0 }]
    : []),
  // Helius Devnet (requires API key; preferred default when available)
  ...(HELIUS_URL
    ? [{ url: HELIUS_URL, name: 'Helius Devnet', priority: 1 }]
    : []),
  // Solana public Devnet (may be rate-limited)
  {
    url: 'https://api.devnet.solana.com',
    name: 'Solana Labs Devnet',
    priority: 2,
  },
  // Fallback to clusterApiUrl
  {
    url: clusterApiUrl(WalletAdapterNetwork.Devnet),
    name: 'Default Devnet',
    priority: 3,
  },
];

export class RpcEndpointManager {
  private endpoints: RpcEndpoint[];
  private failedEndpoints: Set<string> = new Set();
  private currentEndpointIndex = 0;

  constructor(endpoints: RpcEndpoint[]) {
    this.endpoints = [...endpoints].sort((a, b) => a.priority - b.priority);
  }

  getCurrentEndpoint(): RpcEndpoint {
    const availableEndpoints = this.endpoints.filter(
      endpoint => !this.failedEndpoints.has(endpoint.url)
    );

    if (availableEndpoints.length === 0) {
      // Reset failed endpoints if all have failed
      this.failedEndpoints.clear();
      this.currentEndpointIndex = 0;
      return this.endpoints[0];
    }

    if (this.currentEndpointIndex >= availableEndpoints.length) {
      this.currentEndpointIndex = 0;
    }

    return availableEndpoints[this.currentEndpointIndex];
  }

  markEndpointAsFailed(url: string): void {
    this.failedEndpoints.add(url);
    console.warn(`RPC endpoint marked as failed: ${url}`);
  }

  switchToNextEndpoint(): RpcEndpoint {
    this.currentEndpointIndex++;
    return this.getCurrentEndpoint();
  }

  resetFailedEndpoints(): void {
    this.failedEndpoints.clear();
    this.currentEndpointIndex = 0;
  }

  getEndpointStatus(): { total: number; failed: number; current: string } {
    const current = this.getCurrentEndpoint();
    return {
      total: this.endpoints.length,
      failed: this.failedEndpoints.size,
      current: current.name,
    };
  }
}