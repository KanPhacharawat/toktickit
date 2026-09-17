// Login throttling — Lab 3 BR-16.
//
// Keyed by normalized email and held in memory, which suits the single
// instance this lab runs. The lock expires on its own; there is deliberately
// no unlock function (account unlocking is out of scope).

export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

interface Entry {
  failures: number[];
  lockedUntil: number | null;
}

export interface LoginThrottle {
  /** Seconds until the email may try again, or 0 when it is not locked. */
  retryAfterSeconds(email: string): number;
  recordFailure(email: string): void;
  recordSuccess(email: string): void;
  clear(): void;
}

export function createLoginThrottle(now: () => number = Date.now): LoginThrottle {
  const entries = new Map<string, Entry>();

  function entryFor(email: string): Entry {
    let entry = entries.get(email);
    if (!entry) {
      entry = { failures: [], lockedUntil: null };
      entries.set(email, entry);
    }
    return entry;
  }

  return {
    retryAfterSeconds(email) {
      const entry = entries.get(email);
      if (!entry?.lockedUntil) return 0;

      const remaining = entry.lockedUntil - now();
      if (remaining <= 0) {
        // The lock has run out: start the email with a clean slate.
        entries.delete(email);
        return 0;
      }
      return Math.ceil(remaining / 1000);
    },

    recordFailure(email) {
      const entry = entryFor(email);
      const current = now();
      entry.failures = entry.failures.filter((at) => current - at < FAILURE_WINDOW_MS);
      entry.failures.push(current);
      if (entry.failures.length >= MAX_FAILED_ATTEMPTS) {
        entry.lockedUntil = current + LOCK_DURATION_MS;
      }
    },

    recordSuccess(email) {
      entries.delete(email);
    },

    clear() {
      entries.clear();
    },
  };
}

/** The process-wide throttle used by the login route. */
export const loginThrottle = createLoginThrottle();

/** Test-only: forget every recorded attempt between test cases. */
export function resetLoginThrottle() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetLoginThrottle is only available in tests.");
  }
  loginThrottle.clear();
}
