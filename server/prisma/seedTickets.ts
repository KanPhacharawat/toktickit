import type { PrismaClient } from "@prisma/client";

// Lab 4 seed fixtures for Tickets and Actions Taken (specification.md §7.4).
//
// Every Ticket is upserted on its `ticketNumber` (natural unique key) and
// every Action Taken on `(ticketId, clientRequestId)` (BR-15's own
// idempotency key), so running the seed twice never creates duplicates or a
// second copy of the same fixture (AC-38). Together the fixtures below cover:
// all 8 TicketStatus values, all 4 priority levels, assigned and unassigned
// Tickets, Tickets with 0 / 1 / many Actions Taken (including one performed
// by a non-owner IT Staff member, one still Planned, and one Cancelled), and
// a Requester (Requester E) left with zero Tickets for the empty-dashboard
// state.

interface ActionFixture {
  clientRequestId: string;
  actionAt: string;
  description: string;
  status: "Planned" | "Completed" | "Cancelled";
  result?: string;
  performedByEmail: string;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

interface TicketFixture {
  ticketNumber: string;
  ticketDate: string;
  requesterEmail: string;
  categoryName: string;
  relatedSystemName: string;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus:
    | "New"
    | "Open"
    | "InProgress"
    | "WaitingForRequester"
    | "Resolved"
    | "Closed"
    | "Reopened"
    | "Cancelled";
  ticketOwnerEmail?: string;
  resolutionSummary?: string;
  resolvedAt?: string;
  closedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  actions: ActionFixture[];
}

export const TICKET_FIXTURES: TicketFixture[] = [
  // --- New: zero actions, unassigned ---------------------------------------
  {
    ticketNumber: "TT-20260901-9001",
    ticketDate: "2026-09-01T09:00:00.000Z",
    requesterEmail: "requester-a@example.com",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    summary: "Laptop will not power on",
    description: "The laptop screen stays black and the power light never comes on, even after charging overnight.",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    currentStatus: "New",
    actions: [],
  },
  {
    ticketNumber: "TT-20260901-9002",
    ticketDate: "2026-09-01T10:00:00.000Z",
    requesterEmail: "requester-b@example.com",
    categoryName: "Account and Access",
    relatedSystemName: "Email and Calendar",
    summary: "Need access to shared calendar",
    description: "I was added to the Finance team but I still cannot see the shared department calendar.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "New",
    actions: [],
  },

  // --- Open: zero or one Planned action, assigned ---------------------------
  {
    ticketNumber: "TT-20260902-9003",
    ticketDate: "2026-09-02T09:00:00.000Z",
    requesterEmail: "requester-a@example.com",
    categoryName: "Network",
    relatedSystemName: "Campus Wi-Fi",
    summary: "Wi-Fi disconnects every few minutes",
    description: "On the third floor the campus Wi-Fi drops the connection roughly every five minutes.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "Open",
    ticketOwnerEmail: "itstaff-1@example.com",
    actions: [],
  },
  {
    ticketNumber: "TT-20260902-9004",
    ticketDate: "2026-09-02T11:00:00.000Z",
    requesterEmail: "requester-c@example.com",
    categoryName: "Software",
    relatedSystemName: "Student Information System",
    summary: "Grades page fails to load",
    description: "The grades page in the Student Information System shows a blank screen after signing in.",
    requestedPriority: "LOW",
    itPriority: "LOW",
    currentStatus: "Open",
    ticketOwnerEmail: "itstaff-2@example.com",
    actions: [
      {
        clientRequestId: "seed-action-0004-01",
        actionAt: "2026-09-02T12:00:00.000Z",
        description: "Investigating the failure with the SIS support vendor.",
        status: "Planned",
        performedByEmail: "itstaff-2@example.com",
      },
    ],
  },

  // --- InProgress: many actions, including a non-owner performer and a Planned one ---
  {
    ticketNumber: "TT-20260903-9005",
    ticketDate: "2026-09-03T09:00:00.000Z",
    requesterEmail: "requester-b@example.com",
    categoryName: "Network",
    relatedSystemName: "VPN",
    summary: "VPN drops every hour during work",
    description: "The VPN connection drops roughly every hour and I have to reconnect and sign in again.",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    currentStatus: "InProgress",
    ticketOwnerEmail: "itstaff-1@example.com",
    actions: [
      {
        clientRequestId: "seed-action-0005-01",
        actionAt: "2026-09-03T10:00:00.000Z",
        description: "Reviewed VPN concentrator logs for the affected account.",
        status: "Completed",
        result: "Found repeated re-authentication timeouts in the logs.",
        performedByEmail: "itstaff-1@example.com",
      },
      {
        // Demonstrates BR-02: a different IT Staff member than the Ticket Owner.
        clientRequestId: "seed-action-0005-02",
        actionAt: "2026-09-03T14:00:00.000Z",
        description: "Updated VPN client configuration profile.",
        status: "Completed",
        result: "Pushed the updated profile; user reports fewer drops so far.",
        performedByEmail: "itstaff-2@example.com",
        followUpRequired: true,
        followUpNote: "Confirm with the Requester after one full work day.",
      },
      {
        clientRequestId: "seed-action-0005-03",
        actionAt: "2026-09-04T09:00:00.000Z",
        description: "Follow-up check on VPN stability planned for tomorrow.",
        status: "Planned",
        performedByEmail: "itstaff-1@example.com",
      },
    ],
  },
  {
    ticketNumber: "TT-20260903-9006",
    ticketDate: "2026-09-03T13:00:00.000Z",
    requesterEmail: "requester-c@example.com",
    categoryName: "Hardware",
    relatedSystemName: "Printing Service",
    summary: "Office printer jams on every print job",
    description: "The third-floor office printer jams on almost every print job regardless of the file being printed.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "InProgress",
    ticketOwnerEmail: "itstaff-2@example.com",
    actions: [
      {
        clientRequestId: "seed-action-0006-01",
        actionAt: "2026-09-03T15:00:00.000Z",
        description: "Cleared the paper path and replaced the worn feed roller.",
        status: "Completed",
        result: "Printer ran ten test pages without jamming.",
        performedByEmail: "itstaff-2@example.com",
        followUpRequired: true,
        followUpNote: "Check again in one week in case the roller wear returns.",
      },
    ],
  },

  // --- WaitingForRequester -----------------------------------------------
  {
    ticketNumber: "TT-20260904-9007",
    ticketDate: "2026-09-04T09:00:00.000Z",
    requesterEmail: "requester-a@example.com",
    categoryName: "Account and Access",
    relatedSystemName: "File Storage",
    summary: "Cannot access shared department folder",
    description: "I lost access to the shared department folder after switching teams last week.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "WaitingForRequester",
    ticketOwnerEmail: "itstaff-1@example.com",
    actions: [
      {
        clientRequestId: "seed-action-0007-01",
        actionAt: "2026-09-04T10:30:00.000Z",
        description: "Re-granted folder permissions for the new team.",
        status: "Completed",
        result: "Access restored; asked the Requester to confirm.",
        performedByEmail: "itstaff-1@example.com",
      },
    ],
  },
  {
    ticketNumber: "TT-20260904-9008",
    ticketDate: "2026-09-04T11:00:00.000Z",
    requesterEmail: "requester-d@example.com",
    categoryName: "Software",
    relatedSystemName: "Corporate Laptop",
    summary: "Antivirus software will not update",
    description: "The antivirus client on my laptop reports a failed update every time it tries to check for a new signature.",
    requestedPriority: "LOW",
    itPriority: "LOW",
    currentStatus: "WaitingForRequester",
    ticketOwnerEmail: "itstaff-3@example.com",
    actions: [],
  },

  // --- Resolved -------------------------------------------------------------
  {
    ticketNumber: "TT-20260905-9009",
    ticketDate: "2026-09-05T09:00:00.000Z",
    requesterEmail: "requester-b@example.com",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    summary: "Laptop battery drains within two hours",
    description: "The laptop battery used to last most of the day and now drops to zero within about two hours.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "Resolved",
    ticketOwnerEmail: "itstaff-1@example.com",
    resolutionSummary: "Replaced the battery with an OEM part; verified four hours of runtime under normal use.",
    resolvedAt: "2026-09-05T15:00:00.000Z",
    actions: [
      {
        clientRequestId: "seed-action-0009-01",
        actionAt: "2026-09-05T14:00:00.000Z",
        description: "Replaced the battery with an OEM part.",
        status: "Completed",
        result: "Laptop now runs about four hours on battery.",
        performedByEmail: "itstaff-1@example.com",
        completedAt: "2026-09-05T14:30:00.000Z",
      },
    ],
  },
  {
    ticketNumber: "TT-20260905-9010",
    ticketDate: "2026-09-05T10:00:00.000Z",
    requesterEmail: "requester-c@example.com",
    categoryName: "Network",
    relatedSystemName: "Campus Wi-Fi",
    summary: "Cannot connect to guest Wi-Fi network",
    description: "A visiting guest in my office could not connect to the guest Wi-Fi network despite entering the correct passphrase.",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    currentStatus: "Resolved",
    ticketOwnerEmail: "itstaff-2@example.com",
    resolutionSummary: "Reset the guest network passphrase and confirmed a successful connection on site.",
    resolvedAt: "2026-09-05T16:00:00.000Z",
    actions: [
      {
        clientRequestId: "seed-action-0010-01",
        actionAt: "2026-09-05T15:30:00.000Z",
        description: "Reset the guest network passphrase and tested the connection.",
        status: "Completed",
        result: "Guest device connected successfully after the reset.",
        performedByEmail: "itstaff-2@example.com",
        completedAt: "2026-09-05T15:45:00.000Z",
      },
    ],
  },

  // --- Closed: one completed-only, one completed + cancelled action ----------
  {
    ticketNumber: "TT-20260906-9011",
    ticketDate: "2026-09-06T09:00:00.000Z",
    requesterEmail: "requester-a@example.com",
    categoryName: "Software",
    relatedSystemName: "Email and Calendar",
    summary: "Email client repeatedly asks to sign in",
    description: "The desktop email client asks me to sign in again every few minutes, even right after a successful sign-in.",
    requestedPriority: "LOW",
    itPriority: "LOW",
    currentStatus: "Closed",
    ticketOwnerEmail: "itstaff-1@example.com",
    resolutionSummary: "Cleared the cached credentials and re-authenticated the mail profile.",
    resolvedAt: "2026-09-06T13:00:00.000Z",
    closedAt: "2026-09-07T09:00:00.000Z",
    actions: [
      {
        clientRequestId: "seed-action-0011-01",
        actionAt: "2026-09-06T12:30:00.000Z",
        description: "Cleared cached credentials and re-authenticated the mail profile.",
        status: "Completed",
        result: "Sign-in prompts stopped after clearing the cache.",
        performedByEmail: "itstaff-1@example.com",
        completedAt: "2026-09-06T12:45:00.000Z",
      },
    ],
  },
  {
    ticketNumber: "TT-20260906-9012",
    ticketDate: "2026-09-06T10:00:00.000Z",
    requesterEmail: "requester-d@example.com",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    summary: "Requesting a replacement keyboard",
    description: "Several keys on my laptop keyboard have stopped registering key presses over the past week.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "Closed",
    ticketOwnerEmail: "itstaff-3@example.com",
    resolutionSummary: "Replaced the laptop keyboard assembly; all keys verified working.",
    resolvedAt: "2026-09-06T15:00:00.000Z",
    closedAt: "2026-09-07T10:00:00.000Z",
    actions: [
      {
        clientRequestId: "seed-action-0012-01",
        actionAt: "2026-09-06T11:00:00.000Z",
        description: "Ordered a replacement keyboard part; original plan was to repair in place.",
        status: "Cancelled",
        performedByEmail: "itstaff-3@example.com",
        cancelledAt: "2026-09-06T11:30:00.000Z",
        cancelReason: "Replacement part was already in stock; full assembly swap was faster.",
      },
      {
        clientRequestId: "seed-action-0012-02",
        actionAt: "2026-09-06T14:00:00.000Z",
        description: "Replaced the full keyboard assembly.",
        status: "Completed",
        result: "All keys tested and working correctly.",
        performedByEmail: "itstaff-3@example.com",
        completedAt: "2026-09-06T14:30:00.000Z",
      },
    ],
  },

  // --- Reopened ---------------------------------------------------------------
  {
    ticketNumber: "TT-20260907-9013",
    ticketDate: "2026-09-07T09:00:00.000Z",
    requesterEmail: "requester-b@example.com",
    categoryName: "Network",
    relatedSystemName: "VPN",
    summary: "VPN issue returned after being marked resolved",
    description: "The VPN connection started dropping again a few days after IT said the issue was fixed.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "Reopened",
    ticketOwnerEmail: "itstaff-2@example.com",
    actions: [
      {
        clientRequestId: "seed-action-0013-01",
        actionAt: "2026-09-07T10:00:00.000Z",
        description: "Original fix applied before the issue returned.",
        status: "Completed",
        result: "Issue appeared resolved at the time, later recurred.",
        performedByEmail: "itstaff-2@example.com",
        completedAt: "2026-09-07T10:30:00.000Z",
      },
    ],
  },
  {
    ticketNumber: "TT-20260907-9014",
    ticketDate: "2026-09-07T11:00:00.000Z",
    requesterEmail: "requester-c@example.com",
    categoryName: "Software",
    relatedSystemName: "Student Information System",
    summary: "Grades page issue reoccurred",
    description: "The Student Information System grades page went blank again after working correctly for a day.",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    currentStatus: "Reopened",
    ticketOwnerEmail: "itstaff-1@example.com",
    actions: [],
  },

  // --- Cancelled ----------------------------------------------------------
  {
    ticketNumber: "TT-20260908-9015",
    ticketDate: "2026-09-08T09:00:00.000Z",
    requesterEmail: "requester-a@example.com",
    categoryName: "Account and Access",
    relatedSystemName: "Email and Calendar",
    summary: "Duplicate access request submitted by mistake",
    description: "I submitted this ticket twice by mistake; please cancel this duplicate copy.",
    requestedPriority: "LOW",
    itPriority: "LOW",
    currentStatus: "Cancelled",
    cancelledAt: "2026-09-08T09:30:00.000Z",
    cancelReason: "Duplicate of TT-20260901-9002; the Requester confirmed by email.",
    actions: [],
  },
  {
    ticketNumber: "TT-20260908-9016",
    ticketDate: "2026-09-08T10:00:00.000Z",
    requesterEmail: "requester-d@example.com",
    categoryName: "Hardware",
    relatedSystemName: "Printing Service",
    summary: "Printer request no longer needed",
    description: "The printer replacement I requested is no longer needed since the department moved offices.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "Cancelled",
    ticketOwnerEmail: "itstaff-3@example.com",
    cancelledAt: "2026-09-08T11:00:00.000Z",
    cancelReason: "Requester no longer needs this after the department relocated.",
    actions: [],
  },
];

/**
 * Seeds Tickets and their Actions Taken. Assumes Categories, RelatedSystems,
 * and the seeded User accounts already exist (seedDatabase runs this last).
 * Every upsert is keyed by a natural unique column, so re-running this
 * function is safe (AC-38).
 */
export async function seedTicketsAndActions(prisma: PrismaClient) {
  const [categories, relatedSystems, users] = await Promise.all([
    prisma.category.findMany(),
    prisma.relatedSystem.findMany(),
    prisma.user.findMany(),
  ]);

  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));
  const relatedSystemIdByName = new Map(relatedSystems.map((r) => [r.name, r.id]));
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  const resolveUserId = (email: string): number => {
    const id = userIdByEmail.get(email);
    if (id === undefined) throw new Error(`Seed fixture references unknown user email: ${email}`);
    return id;
  };
  const resolveCategoryId = (name: string): number => {
    const id = categoryIdByName.get(name);
    if (id === undefined) throw new Error(`Seed fixture references unknown category: ${name}`);
    return id;
  };
  const resolveRelatedSystemId = (name: string): number => {
    const id = relatedSystemIdByName.get(name);
    if (id === undefined) throw new Error(`Seed fixture references unknown related system: ${name}`);
    return id;
  };

  let ticketCount = 0;
  let actionCount = 0;

  for (const fixture of TICKET_FIXTURES) {
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber: fixture.ticketNumber },
      update: {
        requesterId: resolveUserId(fixture.requesterEmail),
        categoryId: resolveCategoryId(fixture.categoryName),
        relatedSystemId: resolveRelatedSystemId(fixture.relatedSystemName),
        summary: fixture.summary,
        description: fixture.description,
        requestedPriority: fixture.requestedPriority,
        itPriority: fixture.itPriority,
        currentStatus: fixture.currentStatus,
        ticketOwnerId: fixture.ticketOwnerEmail ? resolveUserId(fixture.ticketOwnerEmail) : null,
        resolutionSummary: fixture.resolutionSummary ?? null,
        resolvedAt: fixture.resolvedAt ? new Date(fixture.resolvedAt) : null,
        closedAt: fixture.closedAt ? new Date(fixture.closedAt) : null,
        cancelledAt: fixture.cancelledAt ? new Date(fixture.cancelledAt) : null,
        cancelReason: fixture.cancelReason ?? null,
        deletedAt: null,
      },
      create: {
        ticketNumber: fixture.ticketNumber,
        ticketDate: new Date(fixture.ticketDate),
        requesterId: resolveUserId(fixture.requesterEmail),
        categoryId: resolveCategoryId(fixture.categoryName),
        relatedSystemId: resolveRelatedSystemId(fixture.relatedSystemName),
        summary: fixture.summary,
        description: fixture.description,
        requestedPriority: fixture.requestedPriority,
        itPriority: fixture.itPriority,
        currentStatus: fixture.currentStatus,
        ticketOwnerId: fixture.ticketOwnerEmail ? resolveUserId(fixture.ticketOwnerEmail) : null,
        resolutionSummary: fixture.resolutionSummary ?? null,
        resolvedAt: fixture.resolvedAt ? new Date(fixture.resolvedAt) : null,
        closedAt: fixture.closedAt ? new Date(fixture.closedAt) : null,
        cancelledAt: fixture.cancelledAt ? new Date(fixture.cancelledAt) : null,
        cancelReason: fixture.cancelReason ?? null,
        createdAt: new Date(fixture.ticketDate),
      },
    });
    ticketCount += 1;

    for (const action of fixture.actions) {
      await prisma.actionTaken.upsert({
        where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId: action.clientRequestId } },
        update: {
          actionAt: new Date(action.actionAt),
          description: action.description,
          status: action.status,
          result: action.result ?? null,
          performedById: resolveUserId(action.performedByEmail),
          followUpRequired: action.followUpRequired ?? false,
          followUpNote: action.followUpRequired ? (action.followUpNote ?? null) : null,
          attachmentNotes: action.attachmentNotes ?? null,
          completedAt: action.completedAt ? new Date(action.completedAt) : null,
          cancelledAt: action.cancelledAt ? new Date(action.cancelledAt) : null,
          cancelReason: action.cancelReason ?? null,
        },
        create: {
          ticketId: ticket.id,
          clientRequestId: action.clientRequestId,
          actionAt: new Date(action.actionAt),
          description: action.description,
          status: action.status,
          result: action.result ?? null,
          performedById: resolveUserId(action.performedByEmail),
          createdById: resolveUserId(action.performedByEmail),
          followUpRequired: action.followUpRequired ?? false,
          followUpNote: action.followUpRequired ? (action.followUpNote ?? null) : null,
          attachmentNotes: action.attachmentNotes ?? null,
          completedAt: action.completedAt ? new Date(action.completedAt) : null,
          cancelledAt: action.cancelledAt ? new Date(action.cancelledAt) : null,
          cancelReason: action.cancelReason ?? null,
        },
      });
      actionCount += 1;
    }
  }

  return { tickets: ticketCount, actions: actionCount };
}
