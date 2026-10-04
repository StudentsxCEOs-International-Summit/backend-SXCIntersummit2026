/**
 * Quick DB inspection: check user id=8 and related teams
 */
import "dotenv/config";
import prisma from "../configs/db";

async function inspect() {
  console.log("=== Inspecting Database ===\n");

  // Check user id=8
  const user = await prisma.user.findUnique({ where: { id: 8 } });
  console.log("User id=8:", user ? { id: user.id, name: user.name, email: user.email, status: user.status } : "NOT FOUND");

  // Check teams where leaderId=8
  const teams = await prisma.team.findMany({
    where: { leaderId: 8 },
    include: { leader: true, statuscode: true, programcode: true },
  });
  console.log(`\nTeams with leaderId=8: ${teams.length}`);
  for (const t of teams) {
    console.log(`  Team id=${t.id} name="${t.name}" code="${t.code}" status=${t.status} (${t.statuscode.code}) programId=${t.programId} (${t.programcode.name}) createdAt=${t.createdAt.toISOString()}`);
  }

  // Check status table (what statuses exist)
  const statuses = await prisma.status.findMany({ orderBy: { id: "asc" } });
  console.log("\nStatus table:");
  for (const s of statuses) {
    console.log(`  id=${s.id} code="${s.code}" description="${s.description}"`);
  }

  // Check programs table
  const programs = await prisma.program.findMany({ orderBy: { id: "asc" } });
  console.log("\nProgram table:");
  for (const p of programs) {
    console.log(`  id=${p.id} name="${p.name}" type="${p.type}"`);
  }

  // Check email logs
  const emailLogs = await prisma.emailLog.findMany({
    where: { toEmail: "quykuycuy@gmail.com" },
    orderBy: { sentAt: "desc" },
    take: 5,
  });
  console.log(`\nRecent email logs for quykuycuy@gmail.com: ${emailLogs.length}`);
  for (const log of emailLogs) {
    console.log(`  id=${log.id} template="${log.template}" subject="${log.subject}" status="${log.status}" sentAt=${log.sentAt.toISOString()}`);
  }

  // Check blacklist tokens
  const blacklistCount = await prisma.blacklist.count();
  const expiredCount = await prisma.blacklist.count({ where: { expiresAt: { lt: new Date() } } });
  console.log(`\nBlacklist: ${blacklistCount} total, ${expiredCount} expired`);

  await prisma.$disconnect();
}

inspect().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
