import { describe, it, expect } from "vitest";
import { parseQueueQuery, PAGE_SIZES } from "../../src/queueQuery.js";

// UNIT-07 — queue query parsing (BR-28–31, AC-31, AC-32).

describe("UNIT-07 — queue query parsing (BR-28–31)", () => {
  it("applies the documented defaults (BR-30)", () => {
    const { query } = parseQueueQuery({});
    expect(query).toMatchObject({
      sortBy: "ticketDate",
      sortOrder: "asc",
      page: 1,
      pageSize: 20,
      search: "",
      statusGroup: null,
      currentStatus: null,
      ownership: null,
      itPriority: null,
      requestedPriority: null,
      categoryId: null,
    });
  });

  it("accepts every documented value", () => {
    expect(parseQueueQuery({ statusGroup: "active" }).query?.statusGroup).toBe("active");
    expect(parseQueueQuery({ statusGroup: "closed" }).query?.statusGroup).toBe("closed");
    expect(parseQueueQuery({ ownership: "mine" }).query?.ownership).toBe("mine");
    expect(parseQueueQuery({ ownership: "unassigned" }).query?.ownership).toBe("unassigned");
    for (const p of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      expect(parseQueueQuery({ itPriority: p }).query?.itPriority).toBe(p);
      expect(parseQueueQuery({ requestedPriority: p }).query?.requestedPriority).toBe(p);
    }
    for (const size of PAGE_SIZES) {
      expect(parseQueueQuery({ pageSize: String(size) }).query?.pageSize).toBe(size);
    }
  });

  it("rejects statusGroup combined with currentStatus (BR-29)", () => {
    const result = parseQueueQuery({ statusGroup: "active", currentStatus: "New" });
    expect(result.fieldErrors.currentStatus).toMatch(/not both/i);
  });

  it("rejects unsupported page sizes", () => {
    for (const bad of ["0", "5", "15", "100", "abc", "-10"]) {
      expect(parseQueueQuery({ pageSize: bad }).fieldErrors.pageSize).toBeDefined();
    }
  });

  it("rejects invalid page numbers", () => {
    for (const bad of ["0", "-1", "1.5", "abc"]) {
      expect(parseQueueQuery({ page: bad }).fieldErrors.page).toBeDefined();
    }
  });

  it("rejects unknown sort fields, orders, statuses, and ownership values", () => {
    expect(parseQueueQuery({ sortBy: "summary" }).fieldErrors.sortBy).toBeDefined();
    expect(parseQueueQuery({ sortOrder: "sideways" }).fieldErrors.sortOrder).toBeDefined();
    expect(parseQueueQuery({ currentStatus: "Pending" }).fieldErrors.currentStatus).toBeDefined();
    expect(parseQueueQuery({ ownership: "someone" }).fieldErrors.ownership).toBeDefined();
    expect(parseQueueQuery({ statusGroup: "sideways" }).fieldErrors.statusGroup).toBeDefined();
    expect(parseQueueQuery({ itPriority: "CRITICAL" }).fieldErrors.itPriority).toBeDefined();
    expect(parseQueueQuery({ requestedPriority: "CRITICAL" }).fieldErrors.requestedPriority).toBeDefined();
    expect(parseQueueQuery({ categoryId: "abc" }).fieldErrors.categoryId).toBeDefined();
  });

  it("rejects a search term over 200 characters", () => {
    expect(parseQueueQuery({ search: "a".repeat(201) }).fieldErrors.search).toBeDefined();
    expect(parseQueueQuery({ search: "a".repeat(200) }).fieldErrors.search).toBeUndefined();
  });

  it("trims the search term", () => {
    expect(parseQueueQuery({ search: "  printer  " }).query?.search).toBe("printer");
  });
});
