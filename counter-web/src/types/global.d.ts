interface Window {
  solana?: {
    isPhantom?: boolean;
    connect: () => Promise<any>;
    disconnect: () => Promise<void>;
    on: (event: string, callback: () => void) => void;
    request: (method: any) => Promise<any>;
  };
}