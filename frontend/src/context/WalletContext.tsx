'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type JsonRpcRequest = { method: string; params?: unknown[] | Record<string, unknown> };
export type InjectedProvider = {
  request: (req: JsonRpcRequest) => Promise<unknown>;
  on?: (evt: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (evt: string, cb: (...args: unknown[]) => void) => void;
};

type WalletContextValue = {
  ethereum: InjectedProvider | null;
  account: string;
  chainId: string | null;
  connect: () => Promise<string | null>;
  disconnectLocal: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getInjectedEthereum(): InjectedProvider | null {
  if (typeof window === 'undefined') return null;
  const maybe = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!maybe || typeof (maybe as InjectedProvider).request !== 'function') return null;
  return maybe as InjectedProvider;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [ethereum, setEthereum] = useState<InjectedProvider | null>(null);
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<string | null>(null);

  const refreshAccounts = useCallback(async (eth: InjectedProvider) => {
    const accountsRaw = await eth.request({ method: 'eth_accounts' });
    const accounts = Array.isArray(accountsRaw) ? (accountsRaw as string[]) : [];
    setAccount(accounts[0] || '');
  }, []);

  const refreshChainId = useCallback(async (eth: InjectedProvider) => {
    try {
      const id = await eth.request({ method: 'eth_chainId' });
      setChainId(typeof id === 'string' ? id : String(id ?? ''));
    } catch {
      setChainId(null);
    }
  }, []);

  useEffect(() => {
    const eth = getInjectedEthereum();
    setEthereum(eth);
    if (!eth) return;

    // Initial load
    refreshAccounts(eth).catch(() => {});
    refreshChainId(eth).catch(() => {});

    const handleAccountsChanged = (accountsRaw: unknown) => {
      const accounts = Array.isArray(accountsRaw) ? (accountsRaw as string[]) : [];
      setAccount(accounts[0] || '');
    };

    const handleChainChanged = (newChainId: unknown) => {
      setChainId(typeof newChainId === 'string' ? newChainId : String(newChainId ?? ''));
    };

    if (typeof eth.on === 'function') {
      eth.on('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
      eth.on('chainChanged', handleChainChanged as (...args: unknown[]) => void);
    }

    return () => {
      if (typeof eth.removeListener === 'function') {
        eth.removeListener('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
        eth.removeListener('chainChanged', handleChainChanged as (...args: unknown[]) => void);
      }
    };
  }, [refreshAccounts, refreshChainId]);

  const connect = useCallback(async (): Promise<string | null> => {
    const eth = ethereum ?? getInjectedEthereum();
    if (!eth) return null;
    try {
      const accountsRaw = await eth.request({ method: 'eth_requestAccounts' });
      const accounts = Array.isArray(accountsRaw) ? (accountsRaw as string[]) : [];
      const addr = accounts[0] || '';
      setAccount(addr);
      // chain id may change after connect
      refreshChainId(eth).catch(() => {});
      return addr || null;
    } catch {
      return null;
    }
  }, [ethereum, refreshChainId]);

  const disconnectLocal = useCallback(() => {
    // Wallet extensions generally cannot be programmatically disconnected.
    // This only clears local UI state.
    setAccount('');
  }, []);

  const value = useMemo<WalletContextValue>(() => ({ ethereum, account, chainId, connect, disconnectLocal }), [ethereum, account, chainId, connect, disconnectLocal]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    return {
      ethereum: null,
      account: '',
      chainId: null,
      connect: async () => null,
      disconnectLocal: () => {},
    };
  }
  return ctx;
}
