import prisma from '../../src/configs/db';
import { TEAM_CODES } from './team-codes.data';

export async function seedTeamCodes() {
  const data = TEAM_CODES.map((code) => ({
    code,
    status: 'AVAILABLE' as const,
  }));

  const result = await prisma.masterTeamCode.createMany({
    data,
    skipDuplicates: true,
  });

  const totalInDb = await prisma.masterTeamCode.count();
  console.log(`[SEED] Master team codes: ${result.count} inserted (${totalInDb} total in DB).`);

  return { inserted: result.count, total: totalInDb };
}

if (require.main === module) {
  seedTeamCodes()
    .catch((err) => {
      console.error('[SEED] Master team codes seeding failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
