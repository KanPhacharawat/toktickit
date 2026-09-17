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

  // Lab 3 — reset the seeded development accounts, so the E2E login and the
  // mandatory-password-change fixtures always start from their documented
  // state (BR-59).
  execFileSync("npm", ["run", "prisma:seed"], {
    cwd: serverDir,
    stdio: "inherit",
    shell: true,
  });

  execFileSync(
    "npx",
    ["tsx", "scripts/clean-e2e-data.ts"],
    { cwd: serverDir, stdio: "inherit", shell: true },
  );
}
