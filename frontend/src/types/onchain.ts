export type TxItem = {
    hash: string;
    value: string;
    timestamp: number;
    from?: string;
    to?: string;
};

export type TokenBalance = {
    symbol?: string;
    balance: number;
    address: string;
};

export type Token = {
    address: string;
    symbol?: string;
    decimals?: number;
};
