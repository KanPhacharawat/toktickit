import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Removes any tickets left behind by a previous E2E run before the suite
 * starts, so every run begins from the seeded baseline. Without this, repeated
 * runs accumulate tickets for the same requester and the suite becomes
 * order- and history-dependent.
 *
 * The cleanup runs inside the server workspace because that is where the
 * Prisma client and DATABASE_URL live.
 */
export default function globalSetup() {
  const serverDir = path.resolve(process.cwd(), "server");

  execFileSync(
    "npx",
    ["tsx", "scripts/clean-e2e-data.ts"],
    { cwd: serverDir, stdio: "inherit", shell: true },
  );
}
