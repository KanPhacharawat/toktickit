import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// The upload directory is read at import time, so point it at a throwaway
// directory before the router loads.
const TEST_UPLOAD_DIR = await fs.mkdtemp(
  path.join(os.tmpdir(), "toktickit-attachments-"),
);
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;

const { app } = await import("../../src/app.js");
const { getPrisma } = await import("../../src/prisma.js");
const { MAX_ACTIVE_ATTACHMENTS, MAX_FILE_SIZE_BYTES, isPermittedFile, generateStorageKey, safeDisplayFilename, validateRemovalReason } =
  await import("../../src/attachmentPolicy.js");

const prisma = getPrisma();

/** Marks every row this suite creates so cleanup never touches other data. */
const TAG = "[attachment-test]";
const OWNER_EMAIL = "attachments-owner@test.invalid";
const OTHER_EMAIL = "attachments-other@test.invalid";

let ownerId: number;
let otherId: number;
let ownedTicketId: number;
let foreignTicketId: number;

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

/** POST an attachment to the owned ticket. */
function uploadTo(
  requesterId: number,
  ticketId: number,
  options: {
    buffer?: Buffer;
    filename?: string;
    contentType?: string;
  } = {},
) {
  return request(app)
    .post(`/api/requesters/${requesterId}/tickets/${ticketId}/attachments`)
    .attach("file", options.buffer ?? PNG_BYTES, {
      filename: options.filename ?? "screenshot.png",
      contentType: options.contentType ?? "image/png",
    });
}

const detailUrl = (r: number, t: number) => `/api/requesters/${r}/tickets/${t}`;
const listUrl = (r: number, t: number) => `${detailUrl(r, t)}/attachments`;
const itemUrl = (r: number, t: number, a: number) => `${listUrl(r, t)}/${a}`;

async function createTicketFor(requesterId: number, summary: string) {
  const [category, system] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select: { id: true } }),
  ]);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TT-ATT-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${TAG} ${summary}`,
      description: "Created by the attachments API test suite.",
      requestedPriority: "MEDIUM",
    },
    select: { id: true },
  });
  return ticket.id;
}

async function removeFixtures() {
  await prisma.ticket.deleteMany({ where: { summary: { contains: TAG } } });
}

beforeAll(async () => {
  const [owner, other] = await Promise.all([
    prisma.developmentRequester.upsert({
      where: { email: OWNER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "Attachment Owner", email: OWNER_EMAIL, isActive: true },
      select: { id: true },
    }),
    prisma.developmentRequester.upsert({
      where: { email: OTHER_EMAIL },
      update: { isActive: true, deletedAt: null },
      create: { name: "Attachment Other", email: OTHER_EMAIL, isActive: true },
      select: { id: true },
    }),
  ]);

  ownerId = owner.id;
  otherId = other.id;
  await removeFixtures();
});

beforeEach(async () => {
  await removeFixtures();
  ownedTicketId = await createTicketFor(ownerId, "Owned ticket");
  foreignTicketId = await createTicketFor(otherId, "Foreign ticket");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await removeFixtures();
  await prisma.developmentRequester.deleteMany({
    where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } },
  });
  await prisma.$disconnect();
  await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// UNIT-04 — policy rules
// ---------------------------------------------------------------------------
describe("attachment policy", () => {
  it("permits each documented type with a matching extension (BR-29)", () => {
    expect(isPermittedFile("image/jpeg", "photo.jpg")).toBe(true);
    expect(isPermittedFile("image/jpeg", "photo.jpeg")).toBe(true);
    expect(isPermittedFile("image/png", "shot.PNG")).toBe(true);
    expect(isPermittedFile("image/webp", "art.webp")).toBe(true);
    expect(isPermittedFile("application/pdf", "report.pdf")).toBe(true);
  });

  it("rejects unsupported types and mismatched extensions", () => {
    expect(isPermittedFile("application/x-msdownload", "virus.exe")).toBe(false);
    expect(isPermittedFile("text/plain", "notes.txt")).toBe(false);
    // A .exe merely declared as an image must not pass.
    expect(isPermittedFile("image/png", "virus.exe")).toBe(false);
    expect(isPermittedFile("application/pdf", "report.png")).toBe(false);
  });

  it("generates a storage key that cannot escape the upload directory (BR-33)", () => {
    const key = generateStorageKey("../../etc/passwd.png");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/");
    expect(key).not.toContain("\\");
    expect(key.endsWith(".png")).toBe(true);
    // Keys are unique per call.
    expect(generateStorageKey("a.png")).not.toBe(generateStorageKey("a.png"));
  });

  it("sanitises the display filename (BR-33)", () => {
    expect(safeDisplayFilename("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayFilename('bad"name.png')).toBe("badname.png");
    expect(safeDisplayFilename("   ")).toBe("attachment");
  });

  it("requires a non-empty removal reason (BR-35)", () => {
    expect(validateRemovalReason("").error).toBeDefined();
    expect(validateRemovalReason("   ").error).toBeDefined();
    expect(validateRemovalReason(undefined).error).toBeDefined();
    expect(validateRemovalReason(42).error).toBeDefined();
    expect(validateRemovalReason("  Duplicate  ").reason).toBe("Duplicate");
  });
});

// ---------------------------------------------------------------------------
// API-07 — Ticket Detail (AC-12)
// ---------------------------------------------------------------------------
describe("GET ticket detail", () => {
  it("returns the full read-only ticket for its owner (AC-12)", async () => {
    const res = await request(app).get(detailUrl(ownerId, ownedTicketId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: ownedTicketId,
      currentStatus: "New",
      requestedPriority: "MEDIUM",
    });
    for (const field of [
      "ticketNumber",
      "ticketDate",
      "requester",
      "category",
      "relatedSystem",
      "summary",
      "description",
      "createdAt",
      "updatedAt",
      "attachments",
    ]) {
      expect(res.body.data[field]).toBeDefined();
    }
    expect(Array.isArray(res.body.data.attachments)).toBe(true);
  });

  it("does not return a ticket owned by another requester (AC-12)", async () => {
    const res = await request(app).get(detailUrl(ownerId, foreignTicketId));

    expect(res.status).toBe(403);
    // BR-09 — nothing about the real owner is revealed.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/Attachment Other/);
    expect(serialized).not.toMatch(new RegExp(String(otherId) + '\\s*[,}]'));
    expect(res.body.data).toBeUndefined();
  });

  it("returns 404 for a ticket that does not exist", async () => {
    const res = await request(app).get(detailUrl(ownerId, 99999999));
    expect(res.status).toBe(404);
  });

  it("includes removed attachments as metadata (BR-38)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "Duplicate screenshot" });

    const res = await request(app).get(detailUrl(ownerId, ownedTicketId));

    expect(res.body.data.attachments).toHaveLength(1);
    expect(res.body.data.attachments[0].removedAt).not.toBeNull();
    expect(res.body.data.attachments[0].removalReason).toBe("Duplicate screenshot");
  });
});

// ---------------------------------------------------------------------------
// API-12 / API-13 — upload (AC-18, AC-19)
// ---------------------------------------------------------------------------
describe("POST attachment", () => {
  it("stores a permitted attachment and returns its metadata (AC-19)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      fileSize: PNG_BYTES.length,
      removedAt: null,
      removalReason: null,
    });
    expect(res.body.data.uploadedAt).toBeDefined();
    // BR-33 — the storage key is never exposed to the client.
    expect(res.body.data.storageKey).toBeUndefined();
  });

  it("writes the bytes to disk under a generated name (BR-33)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, { filename: "photo.png" });

    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: res.body.data.id },
      select: { storageKey: true },
    });
    expect(stored.storageKey).not.toBe("photo.png");

    const onDisk = await fs.readFile(path.join(TEST_UPLOAD_DIR, stored.storageKey));
    expect(onDisk.equals(PNG_BYTES)).toBe(true);
  });

  it("accepts every permitted type (BR-29)", async () => {
    for (const [filename, contentType] of [
      ["a.jpg", "image/jpeg"],
      ["b.jpeg", "image/jpeg"],
      ["c.png", "image/png"],
      ["d.webp", "image/webp"],
      ["e.pdf", "application/pdf"],
    ] as const) {
      const res = await uploadTo(ownerId, ownedTicketId, { filename, contentType });
      expect(res.status).toBe(201);
      // Free the slot for the next type (limit is five).
      await request(app)
        .delete(itemUrl(ownerId, ownedTicketId, res.body.data.id))
        .send({ removalReason: "Cycling through types" });
    }
  });

  it("rejects an unsupported file type with 415 (BR-29)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      filename: "virus.exe",
      contentType: "application/x-msdownload",
    });

    expect(res.status).toBe(415);
    expect(await prisma.attachment.count({ where: { ticketId: ownedTicketId } })).toBe(0);
  });

  it("rejects a disallowed extension declared as an image (BR-29)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      filename: "virus.exe",
      contentType: "image/png",
    });
    expect(res.status).toBe(415);
  });

  it("rejects a file larger than 5 MB with 413 (BR-30)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024, 1),
      filename: "huge.png",
    });

    expect(res.status).toBe(413);
    expect(await prisma.attachment.count({ where: { ticketId: ownedTicketId } })).toBe(0);
  });

  it("accepts a file at exactly the size limit (BR-30)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES, 1),
      filename: "exact.png",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.fileSize).toBe(MAX_FILE_SIZE_BYTES);
  });

  it("rejects a file one byte over the limit (BR-30)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 1),
      filename: "one-byte-over.png",
    });

    expect(res.status).toBe(413);
    expect(await prisma.attachment.count({ where: { ticketId: ownedTicketId } })).toBe(0);
  });

  it("rejects a sixth active attachment with 409 (BR-31)", async () => {
    for (let i = 0; i < MAX_ACTIVE_ATTACHMENTS; i++) {
      const ok = await uploadTo(ownerId, ownedTicketId, { filename: `file-${i}.png` });
      expect(ok.status).toBe(201);
    }

    const sixth = await uploadTo(ownerId, ownedTicketId, { filename: "sixth.png" });
    expect(sixth.status).toBe(409);
    expect(
      await prisma.attachment.count({ where: { ticketId: ownedTicketId } }),
    ).toBe(MAX_ACTIVE_ATTACHMENTS);
  });

  it("frees a slot when an attachment is soft-removed (BR-31)", async () => {
    const ids: number[] = [];
    for (let i = 0; i < MAX_ACTIVE_ATTACHMENTS; i++) {
      const ok = await uploadTo(ownerId, ownedTicketId, { filename: `file-${i}.png` });
      ids.push(ok.body.data.id);
    }
    expect((await uploadTo(ownerId, ownedTicketId, { filename: "sixth.png" })).status).toBe(409);

    await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, ids[0]))
      .send({ removalReason: "Making room" });

    const afterRemoval = await uploadTo(ownerId, ownedTicketId, { filename: "sixth.png" });
    expect(afterRemoval.status).toBe(201);
  });

  it("rejects an upload to another requester's ticket with 403 (AC-22)", async () => {
    const res = await uploadTo(ownerId, foreignTicketId);

    expect(res.status).toBe(403);
    expect(await prisma.attachment.count({ where: { ticketId: foreignTicketId } })).toBe(0);
  });

  it("returns 404 when the ticket does not exist", async () => {
    const res = await uploadTo(ownerId, 99999999);
    expect(res.status).toBe(404);
  });

  it("rejects a request with no file", async () => {
    const res = await request(app).post(listUrl(ownerId, ownedTicketId));
    expect(res.status).toBe(400);
  });

  it("stores a sanitised display filename (BR-33)", async () => {
    const res = await uploadTo(ownerId, ownedTicketId, {
      filename: "../../evil.png",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.originalFilename).toBe("evil.png");
  });
});

// ---------------------------------------------------------------------------
// GET metadata (§10)
// ---------------------------------------------------------------------------
describe("GET attachment metadata", () => {
  it("lists metadata for an owned ticket", async () => {
    await uploadTo(ownerId, ownedTicketId, { filename: "one.png" });
    await uploadTo(ownerId, ownedTicketId, { filename: "two.pdf", contentType: "application/pdf" });

    const res = await request(app).get(listUrl(ownerId, ownedTicketId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "fileSize",
      "id",
      "mimeType",
      "originalFilename",
      "removalReason",
      "removedAt",
      "uploadedAt",
    ]);
    // BR-33 — the storage key never leaves the server.
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/);
  });

  it("keeps removed attachments in the metadata response (BR-38)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "No longer needed" });

    const res = await request(app).get(listUrl(ownerId, ownedTicketId));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].removedAt).not.toBeNull();
    expect(res.body.data[0].removalReason).toBe("No longer needed");
  });

  it("rejects metadata access for another requester's ticket (AC-22)", async () => {
    const res = await request(app).get(listUrl(ownerId, foreignTicketId));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// API-15 — download (AC-21)
// ---------------------------------------------------------------------------
describe("GET attachment download", () => {
  it("returns the file with its stored MIME type", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    const res = await request(app)
      .get(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain("screenshot.png");
    expect(Buffer.from(res.body).equals(PNG_BYTES)).toBe(true);
  });

  it("refuses to download a removed attachment with 410 (AC-21)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "Duplicate screenshot" });

    const res = await request(app).get(
      itemUrl(ownerId, ownedTicketId, uploaded.body.data.id),
    );

    expect(res.status).toBe(410);
    // No file content is returned (BR-37).
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error.code).toBe("ATTACHMENT_REMOVED");
  });

  it("rejects a download from another requester with 403 (AC-22)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    const res = await request(app).get(
      itemUrl(otherId, ownedTicketId, uploaded.body.data.id),
    );

    expect(res.status).toBe(403);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("returns 404 for an attachment that belongs to a different ticket", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    const secondTicket = await createTicketFor(ownerId, "Second owned ticket");

    const res = await request(app).get(
      itemUrl(ownerId, secondTicket, uploaded.body.data.id),
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when the stored file is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.body.data.id },
      select: { storageKey: true },
    });
    await fs.unlink(path.join(TEST_UPLOAD_DIR, stored.storageKey));

    const res = await request(app).get(
      itemUrl(ownerId, ownedTicketId, uploaded.body.data.id),
    );

    expect(res.status).toBe(404);
    // BR-39 — no filesystem path leaks to the client.
    expect(JSON.stringify(res.body)).not.toMatch(/[A-Za-z]:\\|\/tmp\/|uploads/);
  });
});

// ---------------------------------------------------------------------------
// API-14 — soft removal (AC-20)
// ---------------------------------------------------------------------------
describe("DELETE attachment (soft removal)", () => {
  it("sets the removal state and keeps the metadata row (AC-20, BR-36)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    const res = await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "Duplicate screenshot" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: uploaded.body.data.id,
      removalReason: "Duplicate screenshot",
    });
    expect(res.body.data.removedAt).not.toBeNull();

    // The row is still there — this is soft removal, not deletion.
    const stored = await prisma.attachment.findUnique({
      where: { id: uploaded.body.data.id },
    });
    expect(stored).not.toBeNull();
    expect(stored?.removedAt).not.toBeNull();
    expect(stored?.removalReason).toBe("Duplicate screenshot");
  });

  it("requires a removal reason (BR-35)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    for (const body of [{}, { removalReason: "" }, { removalReason: "   " }]) {
      const res = await request(app)
        .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.removalReason).toEqual(expect.any(String));
    }

    // Nothing was removed by the rejected attempts.
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.body.data.id },
    });
    expect(stored.removedAt).toBeNull();
  });

  it("trims the removal reason", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    const res = await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "   Duplicate   " });

    expect(res.body.data.removalReason).toBe("Duplicate");
  });

  it("rejects removal by another requester with 403 (AC-22)", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);

    const res = await request(app)
      .delete(itemUrl(otherId, ownedTicketId, uploaded.body.data.id))
      .send({ removalReason: "Not mine to remove" });

    expect(res.status).toBe(403);
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.body.data.id },
    });
    expect(stored.removedAt).toBeNull();
  });

  it("returns 404 for an attachment that does not exist", async () => {
    const res = await request(app)
      .delete(itemUrl(ownerId, ownedTicketId, 99999999))
      .send({ removalReason: "Does not exist" });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the attachment is already removed", async () => {
    const uploaded = await uploadTo(ownerId, ownedTicketId);
    const url = itemUrl(ownerId, ownedTicketId, uploaded.body.data.id);

    await request(app).delete(url).send({ removalReason: "First removal" });
    const second = await request(app)
      .delete(url)
      .send({ removalReason: "Second removal" });

    expect(second.status).toBe(409);
    // The original reason is preserved.
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.body.data.id },
    });
    expect(stored.removalReason).toBe("First removal");
  });
});

// ---------------------------------------------------------------------------
// AC-23 / BR-39 — unexpected failures stay safe
// ---------------------------------------------------------------------------
describe("attachment failures", () => {
  it("returns a safe 500 without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.attachment, "findMany").mockRejectedValue(
      new Error('Invalid `prisma.attachment.findMany()` at C:\\repo\\server\\src\\attachments.ts:180'),
    );

    const res = await request(app).get(listUrl(ownerId, ownedTicketId));

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/\.ts:/);
    expect(res.body.error.stack).toBeUndefined();
  });

  it("does not leave an orphan file when the metadata write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = (await fs.readdir(TEST_UPLOAD_DIR)).length;

    vi.spyOn(prisma.attachment, "create").mockRejectedValue(
      new Error("write failed"),
    );

    const res = await uploadTo(ownerId, ownedTicketId);

    expect(res.status).toBe(500);
    // The bytes written before the failure are cleaned up.
    expect((await fs.readdir(TEST_UPLOAD_DIR)).length).toBe(before);
  });
});
