import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // TODO: Seed default 'speed_typing' activity and pangram text bank metadata once schema for config is finalized.
  console.warn("TODO: implement seed data for activities-core");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
