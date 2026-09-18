import { describe, it, expect } from "vitest";
import { TICKET_STATUSES } from "../../src/ticketListQuery.js";
import {
  TRANSITIONS,
  allowedStatusTransitions,
  isOwnerRequiredTarget,
  isPermittedTransition,
  isTerminal,
} from "../../src/statusTransitions.js";

// UNIT-08 / UNIT-09 — the status transition matrix (BR-39, BR-40).

const DOCUMENTED: Record<string, string[]> = {
  New: ["Open", "Cancelled"],
  Open: ["InProgress", "WaitingForRequester", "Cancelled"],
  InProgress: ["WaitingForRequester", "Resolved", "Cancelled"],
  WaitingForRequester: ["InProgress", "Resolved", "Cancelled"],
  Resolved: ["Closed", "Reopened"],
  Reopened: ["InProgress", "WaitingForRequester", "Cancelled"],
  Closed: [],
  Cancelled: [],
};

describe("UNIT-08 — transition matrix (BR-39, AC-39, AC-40)", () => {
  it("permits exactly the documented pairs across all 64 combinations", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        const expected = DOCUMENTED[from].includes(to);
        expect(isPermittedTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("rejects every same-status transition", () => {
    for (const status of TICKET_STATUSES) {
      expect(isPermittedTransition(status, status)).toBe(false);
    }
  });

  it("has no outgoing transitions from a terminal status", () => {
    expect(TRANSITIONS.Closed).toHaveLength(0);
    expect(TRANSITIONS.Cancelled).toHaveLength(0);
    expect(isTerminal("Closed")).toBe(true);
    expect(isTerminal("Cancelled")).toBe(true);
    expect(isTerminal("New")).toBe(false);
  });
});

describe("UNIT-09 — owner-required targets and allowed transitions (BR-38, BR-40, AC-41)", () => {
  it("requires an owner only for Open, In Progress, Waiting for Requester, and Resolved", () => {
    expect(isOwnerRequiredTarget("Open")).toBe(true);
    expect(isOwnerRequiredTarget("InProgress")).toBe(true);
    expect(isOwnerRequiredTarget("WaitingForRequester")).toBe(true);
    expect(isOwnerRequiredTarget("Resolved")).toBe(true);
    expect(isOwnerRequiredTarget("Cancelled")).toBe(false);
    expect(isOwnerRequiredTarget("Closed")).toBe(false);
    expect(isOwnerRequiredTarget("Reopened")).toBe(false);
  });

  it("is empty without operational authority", () => {
    expect(allowedStatusTransitions("New", false, false)).toEqual([]);
    expect(allowedStatusTransitions("New", true, false)).toEqual([]);
  });

  it("is empty on a terminal ticket even with authority", () => {
    expect(allowedStatusTransitions("Closed", true, true)).toEqual([]);
    expect(allowedStatusTransitions("Cancelled", true, true)).toEqual([]);
  });

  it("omits owner-required targets when unassigned", () => {
    expect(allowedStatusTransitions("New", false, true)).toEqual(["Cancelled"]);
    expect(allowedStatusTransitions("Open", false, true)).toEqual(["Cancelled"]);
  });

  it("includes every documented target once owned, with authority", () => {
    expect(allowedStatusTransitions("New", true, true)).toEqual(["Open", "Cancelled"]);
    expect(allowedStatusTransitions("InProgress", true, true)).toEqual([
      "WaitingForRequester",
      "Resolved",
      "Cancelled",
    ]);
    expect(allowedStatusTransitions("Resolved", true, true)).toEqual(["Closed", "Reopened"]);
  });
});
