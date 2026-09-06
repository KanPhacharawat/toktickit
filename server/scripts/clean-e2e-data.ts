import fs from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "../src/prisma.js";
import { UPLOAD_DIR } from "../src/attachments.js";

/**
 * Deletes the tickets the E2E suite creates, identified by the "E2E " prefix
 * its summaries carry. Attachments cascade with their ticket.
 *
 * Only E2E-tagged rows are touched: seeded reference data and any ticket a
 * person created by hand are left alone.
 *
 * Deleting a ticket removes its Attachment rows but not the bytes on disk, so
 * this also sweeps up upload files that no Attachment row points at any more.
 * Run it only between test runs — an upload in flight has its file on disk
 * before its row is written.
 */
async function main() {
  const prisma = getPrisma();

  const { count } = await prisma.ticket.deleteMany({
    where: { summary: { startsWith: "E2E " } },
  });

  const referenced = new Set(
    (
      await prisma.attachment.findMany({ select: { storageKey: true } })
    ).map((a) => a.storageKey),
  );

  let orphans = 0;
  const files = await fs.readdir(UPLOAD_DIR).catch(() => [] as string[]);
  for (const file of files) {
    if (referenced.has(file)) continue;
    await fs.unlink(path.join(UPLOAD_DIR, file)).catch(() => undefined);
    orphans += 1;
  }

  console.log(
    `Removed ${count} ticket(s) and ${orphans} orphaned upload file(s) left by previous E2E runs.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
