// Project-level global type declarations
// Keep this file minimal and safe. Do NOT modify system @types files.

declare global {
    interface Window {
        // Wallet providers (e.g. MetaMask) expose `ethereum` on window.
        // Narrowing to `any` here is safe and avoids leaking system types.
        ethereum?: any;
    }

    namespace NodeJS {
        interface ProcessEnv {
            NEXT_PUBLIC_API_URL?: string;
            NEXT_PUBLIC_NETWORK?: string;
        }
    }
}
