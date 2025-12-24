/**
 * Compatibility shim: ensure a global `AsyncIterator` declaration exists
 * with the same type parameter names and arity as other lib declarations.
 * This avoids VSCode/tsserver complaints about differing type parameter lists
 * between lib typings and Node's type definitions.
 *
 * Keep this file ambient (no exports).
 */

interface AsyncIterator<T = unknown, TReturn = unknown, TNext = undefined> {
    next(...args: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;
    return?(value?: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>>;
    throw?(e?: unknown): Promise<IteratorResult<T, TReturn>>;
}
