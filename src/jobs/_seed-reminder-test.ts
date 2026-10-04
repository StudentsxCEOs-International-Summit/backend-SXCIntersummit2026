/**
 * Seed script: memastikan data yang dibutuhkan untuk testing
 * deadline reminder & payment reminder ada di database.
 *
 * Creates:
 *   - status id=15 (PENDING) if not exists
 *   - A program (COMPETITION type) if none exists
 *   - A team for user id=8 with status=15, createdAt 5 days ago
 */
import "dotenv/config";
import prisma from "../configs/db";

async function seed() {
  console.log("=== Seeding test data for reminder test ===\n");

  // 1. Ensure status id=15 exists
  const status15 = await prisma.status.findUnique({ where: { id: 15 } });
  if (!status15) {
    console.log("Creating status id=15 (PENDING_PAYMENT)...");
    await prisma.status.create({
      data: {
        id: 15,
        code: "PENDING_PAYMENT",
        description: "Tim sudah terdaftar, menunggu pembayaran",
      },
    });
    console.log("  ✔ Status id=15 created.");
  } else {
    console.log(`  ℹ Status id=15 already exists: code="${status15.code}"`);
  }

  // 2. Ensure at least one program exists
  let program = await prisma.program.findFirst();
  if (!program) {
    console.log("Creating program (BMC - Business Case Competition)...");
    program = await prisma.program.create({
      data: {
        name: "BMC",
        type: "COMPETITION",
      },
    });
    console.log(`  ✔ Program created: id=${program.id} name="${program.name}"`);
  } else {
    console.log(`  ℹ Program already exists: id=${program.id} name="${program.name}"`);
  }

  // 3. Check if user id=8 already has a team
  const existingTeam = await prisma.team.findFirst({
    where: { leaderId: 8 },
  });

  if (existingTeam) {
    console.log(`  ℹ Team already exists for user 8: id=${existingTeam.id} name="${existingTeam.name}" status=${existingTeam.status}`);

    // Update status to 15 and createdAt to 5 days ago if needed
    if (existingTeam.status !== 15) {
      await prisma.team.update({
        where: { id: existingTeam.id },
        data: { status: 15 },
      });
      console.log(`  ✔ Updated team status to 15.`);
    }
  } else {
    // Create team with createdAt 5 days ago (to satisfy payment reminder > 3 days condition)
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    console.log("Creating team for user id=8...");
    const team = await prisma.team.create({
      data: {
        name: "Test Reminder Team",
        code: "TRT-" + Date.now().toString(36).toUpperCase(),
        leaderId: 8,
        programId: program.id,
        status: 15,
        createdAt: fiveDaysAgo,
      },
    });
    console.log(`  ✔ Team created: id=${team.id} name="${team.name}" code="${team.code}" status=${team.status} createdAt=${team.createdAt.toISOString()}`);
  }

  // 4. Verify final state
  console.log("\n=== Verification ===");
  const finalTeam = await prisma.team.findFirst({
    where: { leaderId: 8 },
    include: { leader: true, statuscode: true },
  });
  if (finalTeam) {
    console.log(`Team: "${finalTeam.name}" (status=${finalTeam.status} / ${finalTeam.statuscode.code})`);
    console.log(`Leader: ${finalTeam.leader.name} <${finalTeam.leader.email}>`);
    console.log(`Created: ${finalTeam.createdAt.toISOString()}`);
    const daysSinceCreation = Math.ceil(
      (Date.now() - finalTeam.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    console.log(`Days since creation: ${daysSinceCreation} (needs >3 for payment reminder)`);
  }

  console.log("\n✅ Seed complete. Ready for real reminder test.\n");
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error("Seed error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
