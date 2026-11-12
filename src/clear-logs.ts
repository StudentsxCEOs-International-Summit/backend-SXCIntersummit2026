import "dotenv/config";
import prisma from "./configs/db";
import logger from "./configs/logger";

async function main() {
  const deleted = await prisma.emailLog.deleteMany({
    where: { toEmail: "quykuycuy@gmail.com" },
  });
  logger.info({ context: 'SCRIPT', deletedCount: deleted.count }, 'Deleted email logs');
  await prisma.$disconnect();
}

main();
