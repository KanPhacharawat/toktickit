import { describe, expect, it } from "vitest";
import {
  FAILURE_WINDOW_MS,
  LOCK_DURATION_MS,
  createLoginThrottle,
} from "../../src/auth/loginThrottle.js";

// UNIT-05 (tests.md §2) — login throttling with an injected clock.

function throttleAt(start = 0) {
  let time = start;
  const throttle = createLoginThrottle(() => time);
  return {
    throttle,
    advance(ms: number) {
      time += ms;
    },
  };
}

describe("UNIT-05 — login throttle (BR-16, AC-07)", () => {
  it("allows four failures and locks on the fifth", () => {
    const { throttle } = throttleAt();
    for (let i = 0; i < 4; i++) throttle.recordFailure("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);

    throttle.recordFailure("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(15 * 60);
  });

  it("releases the lock after 15 minutes with a clean slate", () => {
    const { throttle, advance } = throttleAt();
    for (let i = 0; i < 5; i++) throttle.recordFailure("a@example.com");

    advance(LOCK_DURATION_MS - 1000);
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(1);

    advance(1000);
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);

    // A single new failure does not immediately re-lock.
    throttle.recordFailure("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });

  it("only counts failures inside the 15-minute window", () => {
    const { throttle, advance } = throttleAt();
    for (let i = 0; i < 4; i++) throttle.recordFailure("a@example.com");

    advance(FAILURE_WINDOW_MS);
    throttle.recordFailure("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });

  it("resets the count after a successful login", () => {
    const { throttle } = throttleAt();
    for (let i = 0; i < 4; i++) throttle.recordFailure("a@example.com");
    throttle.recordSuccess("a@example.com");
    throttle.recordFailure("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });

  it("tracks each email separately, known or unknown alike", () => {
    const { throttle } = throttleAt();
    for (let i = 0; i < 5; i++) throttle.recordFailure("nobody@example.com");
    expect(throttle.retryAfterSeconds("nobody@example.com")).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds("someone-else@example.com")).toBe(0);
  });
});
