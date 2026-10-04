import "dotenv/config";
import prisma from "./configs/db";

async function main() {
  const deleted = await prisma.emailLog.deleteMany({
    where: { toEmail: "quykuycuy@gmail.com" },
  });
  console.log(`Deleted ${deleted.count} email logs.`);
  await prisma.$disconnect();
}

main();
