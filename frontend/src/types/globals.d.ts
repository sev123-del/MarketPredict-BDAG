// Project-level global type declarations
// Keep this file minimal and safe. Do NOT modify system @types files.

declare global {
    interface Window {
        // Wallet providers (e.g. MetaMask) expose `ethereum` on window.
        // Narrow to a minimal shape to avoid `any` while staying compatible
        ethereum?: {
            request?: (...args: unknown[]) => Promise<unknown>;
            on?: (evt: string, cb: (...args: unknown[]) => void) => void;
            removeListener?: (evt: string, cb: (...args: unknown[]) => void) => void;
        } | unknown;
    }

    namespace NodeJS {
        interface ProcessEnv {
            NEXT_PUBLIC_API_URL?: string;
            NEXT_PUBLIC_NETWORK?: string;
        }
    }
}
