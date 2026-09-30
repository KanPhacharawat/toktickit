import { getPrisma } from "../src/prisma.js";
import { SEED_ACCOUNTS, seedDatabase } from "./seedData.js";

// `npm run prisma:seed` — idempotent; safe to run repeatedly (BR-59).
async function main() {
  const counts = await seedDatabase(getPrisma());

  const byRole = (role: string) => {
    const accounts = SEED_ACCOUNTS.filter((a) => a.role === role);
    const active = accounts.filter((a) => a.isActive).length;
    return `${active} active + ${accounts.length - active} inactive`;
  };

  console.log(
    `Seeded ${counts.categories} categories, ${counts.relatedSystems} related systems, ` +
      `${counts.accounts} accounts (Requesters: ${byRole("Requester")}, ` +
      `IT Staff: ${byRole("ITStaff")}, Administrators: ${byRole("Administrator")}).`,
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
