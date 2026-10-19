import prisma from "../src/configs/db";
import { sign } from "jsonwebtoken";
import { env } from "../src/configs/env";

const API_URL = "http://localhost:3000/api";

async function main() {
  console.log("=== STARTING INTEGRATION TESTS ===");

  // 1. Get or create a mock staff admin & participant for testing
  let staff = await prisma.staff.findFirst({ where: { email: "admin@sxcintersummit.com" } });
  if (!staff) {
    let div = await prisma.division.findFirst();
    if (!div) {
      div = await prisma.division.create({ data: { name: "IT" } });
    }
    staff = await prisma.staff.create({
      data: {
        name: "Test Admin Staff",
        email: "admin@sxcintersummit.com",
        role: "ADMIN",
        password: "hashedpassword123",
        divisionId: div.id,
      },
    });
  }

  let leader = await prisma.user.findFirst({ where: { email: "test-leader@sxc.com" } });
  if (!leader) {
    leader = await prisma.user.create({
      data: {
        name: "Test Leader",
        email: "test-leader@sxc.com",
        role: "USER",
        password: "hashedpassword123",
      },
    });
  }

  let team = await prisma.team.findFirst({ where: { name: "Test Team Alpha" } });
  if (!team) {
    const defaultStatus = await prisma.status.findFirst({ where: { code: "PENDING" } });
    let program = await prisma.program.findFirst();
    if (!program) {
      program = await prisma.program.create({
        data: { name: "IBCC", type: "IBCC" },
      });
    }
    team = await prisma.team.create({
      data: {
        name: "Test Team Alpha",
        code: "TEST-TEAM-001",
        leader: { connect: { id: leader.id } },
        statuscode: { connect: { id: defaultStatus?.id || 15 } },
        programcode: { connect: { id: program.id } },
      },
    });
  }

  // Generate Admin Token
  const adminToken = sign(
    { id: staff.id, email: staff.email, role: staff.role, accountType: "staff" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("Admin token generated for staff:", staff.email);

  // Generate Leader Token
  const leaderToken = sign(
    { id: leader.id, email: leader.email, role: leader.role, accountType: "user" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("LEADER_TOKEN=" + leaderToken);
  console.log("TEAM_ID=" + team.id);

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
  await wait(1000);

  // 2. TEST: Preliminary Round Evaluation (ADMIN-01 & IBCC-05)
  console.log("\n--- TEST: Update Preliminary Evaluation Status ---");
  try {
    const res = await fetch(`${API_URL}/admin/competition/preliminary/${team.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: "passed",
        score: 88.5,
        feedback: "Outstanding concept and implementation plan.",
      }),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 3. TEST: Get Dashboard Teams (Admin)
  console.log("\n--- TEST: Get Competition Dashboard Teams ---");
  try {
    const res = await fetch(`${API_URL}/admin/competition/teams`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Teams Count:", Array.isArray(data.data) ? data.data.length : 0);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 4. TEST: Upload Payment Proof (IBCC-06)
  console.log("\n--- TEST: Upload Payment Proof ---");
  try {
    const formData = new FormData();
    formData.append("teamId", String(team.id));
    const blob = new Blob(["dummy payment receipt image"], { type: "image/png" });
    formData.append("file", blob, "payment.png");

    const res = await fetch(`${API_URL}/upload/payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${leaderToken}`,
      },
      body: formData,
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 5. TEST: Upload Requirement Proof (twibbon/story)
  console.log("\n--- TEST: Upload Requirement Proof ---");
  try {
    const formData = new FormData();
    formData.append("teamId", String(team.id));
    formData.append("type", "twibbon");
    const blob = new Blob(["dummy twibbon screenshot"], { type: "image/png" });
    formData.append("file", blob, "twibbon.png");

    const res = await fetch(`${API_URL}/upload/requirement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${leaderToken}`,
      },
      body: formData,
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 6. TEST: Finance Verification - Payment (ADMIN-02)
  console.log("\n--- TEST: Finance Verify Payment ---");
  try {
    const res = await fetch(`${API_URL}/finance/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        teamId: team.id,
        status: "approved",
        notes: "Payment verified successfully.",
      }),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 7. TEST: Finance Verification - Requirement (Twibbon)
  console.log("\n--- TEST: Finance Verify Requirement ---");
  try {
    const res = await fetch(`${API_URL}/finance/requirement/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        teamId: team.id,
        type: "twibbon",
        status: "approved",
        notes: "Twibbon verified successfully.",
      }),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 8. TEST: Generate Access Code (IBCC-07)
  console.log("\n--- TEST: Generate Access Code ---");
  let accessCode = "";
  try {
    const res = await fetch(`${API_URL}/access-code/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ teamId: team.id }),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
    accessCode = data.data?.accessCode;
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 9. TEST: Login Semifinal (IBCC-08)
  console.log("\n--- TEST: Login Semifinal ---");
  if (accessCode) {
    try {
      const res = await fetch(`${API_URL}/access-code/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId: team.id,
          accessCode: accessCode,
        }),
      });
      const data = await res.json();
      console.log("Status:", res.status);
      console.log("Response:", data);
    } catch (err: any) {
      console.error("Error:", err.message);
    }
  } else {
    console.log("Skipping: No access code generated.");
  }

  // 10. TEST: Upload Semifinal Slides (IBCC-09)
  console.log("\n--- TEST: Upload Semifinal Slide Deck ---");
  try {
    const formData = new FormData();
    formData.append("teamId", String(team.id));
    const blob = new Blob(["dummy pdf slide content"], { type: "application/pdf" });
    formData.append("file", blob, "slidedeck.pdf");

    const res = await fetch(`${API_URL}/upload/slides`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${leaderToken}`,
      },
      body: formData,
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  // 11. TEST: Semifinal Score (ADMIN-03)
  console.log("\n--- TEST: Submit Semifinal Score ---");
  try {
    const res = await fetch(`${API_URL}/semifinal/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        teamId: team.id,
        score: 95.5,
        comment: "Great presentation and solution design!",
      }),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err: any) {
    console.error("Error:", err.message);
  }

  console.log("\n=== ALL TESTS COMPLETED ===");
}

main().catch(console.error).finally(() => prisma.$disconnect());
