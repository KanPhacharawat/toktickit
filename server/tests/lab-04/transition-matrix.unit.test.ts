import { describe, expect, it } from "vitest";
import { TICKET_STATUSES } from "../../src/ticketListQuery.js";
import {
  MATRIX,
  actorFor,
  isPermittedTransition,
  isTerminal,
  permittedTargets,
  requiresReason,
  transitionRequiresGate,
  transitionRequiresOwner,
  type WorkflowActor,
} from "../../src/ticketWorkflowMatrix.js";

// U-02 — specification.md §5.3 / BR-19, FR-11, FR-12, AC-16, AC-17. Every
// (actor, fromStatus, toStatus) cell in the documented matrix, exhaustively.

const ACTORS: WorkflowActor[] = ["Staff", "RequesterOwn"];

/** The documented matrix, keyed [from][to] -> allowed actors (or absent = never). */
const DOCUMENTED: Record<string, Partial<Record<string, WorkflowActor[]>>> = {
  New: {
    Open: ["Staff"],
    InProgress: ["Staff"],
    Cancelled: ["Staff", "RequesterOwn"],
  },
  Open: {
    InProgress: ["Staff"],
    WaitingForRequester: ["Staff"],
    Cancelled: ["Staff"],
  },
  InProgress: {
    WaitingForRequester: ["Staff"],
    Resolved: ["Staff"],
    Cancelled: ["Staff"],
  },
  WaitingForRequester: {
    InProgress: ["Staff"],
    Resolved: ["Staff"],
    Cancelled: ["Staff"],
  },
  Resolved: {
    Closed: ["Staff"],
    Reopened: ["Staff", "RequesterOwn"],
  },
  Reopened: {
    InProgress: ["Staff"],
    WaitingForRequester: ["Staff"],
    Resolved: ["Staff"],
    Cancelled: ["Staff"],
  },
  Closed: {},
  Cancelled: {},
};

const OWNER_REQUIRED: Array<[string, string]> = [
  ["New", "InProgress"],
  ["Open", "InProgress"],
  ["Reopened", "InProgress"],
];

const GATE_REQUIRED: Array<[string, string]> = [
  ["InProgress", "Resolved"],
  ["WaitingForRequester", "Resolved"],
  ["Reopened", "Resolved"],
];

describe("U-02 — transition matrix: every (actor, from, to) cell (BR-19, AC-16, AC-17)", () => {
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      for (const actor of ACTORS) {
        const allowedActors = DOCUMENTED[from][to] ?? [];
        const expected = allowedActors.includes(actor);

        it(`${actor}: ${from} -> ${to} is ${expected ? "permitted" : "rejected"}`, () => {
          expect(isPermittedTransition(actor, from, to)).toBe(expected);
        });
      }
    }
  }

  it("has no outgoing transitions from a terminal status, for either actor", () => {
    expect(Object.keys(MATRIX.Closed)).toHaveLength(0);
    expect(Object.keys(MATRIX.Cancelled)).toHaveLength(0);
    expect(isTerminal("Closed")).toBe(true);
    expect(isTerminal("Cancelled")).toBe(true);
    expect(isTerminal("New")).toBe(false);
  });

  it("rejects every same-status transition for both actors", () => {
    for (const status of TICKET_STATUSES) {
      for (const actor of ACTORS) {
        expect(isPermittedTransition(actor, status, status)).toBe(false);
      }
    }
  });

  it("permittedTargets matches the documented row for each actor", () => {
    for (const from of TICKET_STATUSES) {
      for (const actor of ACTORS) {
        const expected = TICKET_STATUSES.filter((to) =>
          (DOCUMENTED[from][to] ?? []).includes(actor),
        );
        expect(permittedTargets(actor, from).sort()).toEqual([...expected].sort());
      }
    }
  });
});

describe("U-02 — owner-required (¹) and gate-required (²) cells", () => {
  it("requires an owner only on New/Open/Reopened -> InProgress", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        const expected = OWNER_REQUIRED.some(([f, t]) => f === from && t === to);
        expect(transitionRequiresOwner(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("requires the resolution gate only on transitions into Resolved", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        const expected = GATE_REQUIRED.some(([f, t]) => f === from && t === to);
        expect(transitionRequiresGate(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });
});

describe("requiresReason — Resolved, Cancelled, Reopened only", () => {
  it("matches the documented targets", () => {
    for (const status of TICKET_STATUSES) {
      const expected = status === "Resolved" || status === "Cancelled" || status === "Reopened";
      expect(requiresReason(status)).toBe(expected);
    }
  });
});

describe("actorFor — role + ownership -> workflow actor", () => {
  it("maps IT Staff and Administrator to Staff regardless of ownership", () => {
    expect(actorFor("ITStaff", false)).toBe("Staff");
    expect(actorFor("ITStaff", true)).toBe("Staff");
    expect(actorFor("Administrator", false)).toBe("Staff");
  });

  it("maps a Requester who owns the ticket to RequesterOwn, otherwise null", () => {
    expect(actorFor("Requester", true)).toBe("RequesterOwn");
    expect(actorFor("Requester", false)).toBeNull();
  });
});
