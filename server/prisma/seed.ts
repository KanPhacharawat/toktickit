import { getPrisma } from "../src/prisma.js";

// Every seed step is an upsert keyed on a natural unique column, so running
// `npm run prisma:seed` repeatedly never creates duplicates.

// The four supported IT request categories, in display order.
const CATEGORY_NAMES = [
  "Account and Access",
  "Hardware",
  "Software",
  "Network",
];

// Related Systems a Ticket can be raised against (FR-31).
const RELATED_SYSTEM_NAMES = [
  "Campus Wi-Fi",
  "VPN",
  "Email and Calendar",
  "Corporate Laptop",
  "Student Information System",
  "Printing Service",
  "File Storage",
];

// Development Requesters used as the Lab 2 testing identity (BR-04).
// One inactive row is seeded so AC-03 (inactive Requester exclusion) is
// testable against real data.
const REQUESTERS = [
  {
    name: "Requester A",
    email: "requester-a@example.com",
    department: "Finance",
    isActive: true,
  },
  {
    name: "Requester B",
    email: "requester-b@example.com",
    department: "Human Resources",
    isActive: true,
  },
  {
    name: "Requester C",
    email: "requester-c@example.com",
    department: "Registrar",
    isActive: true,
  },
  {
    name: "Requester D",
    email: "requester-d@example.com",
    department: "Library",
    isActive: true,
  },
  {
    name: "Requester E",
    email: "requester-e@example.com",
    department: "Facilities",
    isActive: true,
  },
  {
    name: "Inactive Requester",
    email: "inactive-requester@example.com",
    department: "Archived",
    isActive: false,
  },
];

async function main() {
  const prisma = getPrisma();

  for (const [index, name] of CATEGORY_NAMES.entries()) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true, sortOrder: index, deletedAt: null },
      create: { name, isActive: true, sortOrder: index },
    });
  }

  for (const [index, name] of RELATED_SYSTEM_NAMES.entries()) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true, sortOrder: index, deletedAt: null },
      create: { name, isActive: true, sortOrder: index },
    });
  }

  for (const requester of REQUESTERS) {
    await prisma.developmentRequester.upsert({
      where: { email: requester.email },
      update: {
        name: requester.name,
        department: requester.department,
        isActive: requester.isActive,
        deletedAt: null,
      },
      create: requester,
    });
  }

  const activeRequesters = REQUESTERS.filter((r) => r.isActive).length;
  console.log(
    `Seeded ${CATEGORY_NAMES.length} categories, ` +
      `${RELATED_SYSTEM_NAMES.length} related systems, ` +
      `${REQUESTERS.length} development requesters ` +
      `(${activeRequesters} active).`,
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
