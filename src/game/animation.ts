/**
 * Tiny animation helpers used by the engine.
 */

/**
 * Pause for `ms` milliseconds, then resolve. Used between animation
 * steps (pop, swap, fall) so the engine can `await` real time.
 */
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
