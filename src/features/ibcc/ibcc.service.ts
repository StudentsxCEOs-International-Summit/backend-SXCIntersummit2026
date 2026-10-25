import crypto from 'crypto';
import prisma from '../../configs/db';
import { hashPassword } from '../../utils/bcrypt';
import { sendMail } from '../../services/mail.service';
import { PENDING_PREFIX, pendingFilePath } from '../../services/storage.service';
import { enqueueDriveUpload } from '../../jobs/drive-upload.job';
import {
  renderTeamRegistrationConfirmationEmail,
  renderPreliminaryEvaluationEmail,
} from './ibcc.templates';
import { RegisterTeamInput } from './ibcc.schema';
import { sendSemifinalResultEmails } from './ibcc.status';

export interface RegistrationUploadedFiles {
  ktm_file: Express.Multer.File[];
  follow_proof: Express.Multer.File[];
  twibbon_proof: Express.Multer.File[];
  poster_proof: Express.Multer.File[];
  broadcast_proof: Express.Multer.File[];
}

export async function registerTeam(
  leaderUser: { id: number; email: string; name: string },
  input: RegisterTeamInput,
  files: RegistrationUploadedFiles,
  receivedAt: Date = new Date(),
) {
  const normalizedTeamName = input.teamName.trim();
  const normalizedLeaderEmail = leaderUser.email.toLowerCase().trim();
  const memberEmails = (input.members || []).map((m) => m.email.toLowerCase().trim());

  if (new Set(memberEmails).size !== memberEmails.length) {
    throw new Error('Duplicate member email addresses provided.');
  }

  if (memberEmails.includes(normalizedLeaderEmail)) {
    throw new Error('Leader email cannot be listed as a team member.');
  }

  const existingTeamName = await prisma.team.findUnique({
    where: { name: normalizedTeamName },
  });
  if (existingTeamName) {
    throw new Error('Team name is already taken. Please choose another name.');
  }

  // Hashed up front so the transaction below only holds its connection for database work.
  const placeholderPasswords = new Map<string, string>();
  for (const email of memberEmails) {
    placeholderPasswords.set(email, await hashPassword(crypto.randomBytes(24).toString('hex')));
  }

  const result = await prisma.$transaction(async (tx) => {
    let ibccProgram = await tx.program.findUnique({ where: { name: 'IBCC' } });
    if (!ibccProgram) {
      ibccProgram = await tx.program.create({
        data: { name: 'IBCC', type: 'COMPETITION' },
      });
    }

    const existingLeaderMembership = await tx.team.findFirst({
      where: {
        programId: ibccProgram.id,
        OR: [
          { leaderId: leaderUser.id },
          { TeamMember: { some: { userId: leaderUser.id } } },
        ],
      },
    });
    if (existingLeaderMembership) {
      throw new Error('Leader is already registered in an IBCC team.');
    }

    if (memberEmails.length > 0) {
      const existingMemberMembership = await tx.teamMember.findFirst({
        where: {
          team: { programId: ibccProgram.id },
          user: { email: { in: memberEmails } },
        },
        include: { user: { select: { email: true } } },
      });
      if (existingMemberMembership) {
        throw new Error(
          `Member with email ${existingMemberMembership.user.email} is already in an IBCC team.`,
        );
      }
    }

    // Row lock with SKIP LOCKED prevents concurrent registrations from selecting the same code.
    const availableCodes = await tx.$queryRaw<{ id: number; code: string }[]>`
      SELECT id, code
      FROM master_team_code
      WHERE status = 'AVAILABLE'::"TeamCodeStatus"
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (!availableCodes || availableCodes.length === 0) {
      throw new Error('No available team codes remaining in the pool.');
    }

    const selectedCodeRecord = availableCodes[0];

    // Hold the code during record creation so timeout or abort leaves audit trace.
    await tx.masterTeamCode.update({
      where: { id: selectedCodeRecord.id },
      data: {
        status: 'RESERVED',
        reservedAt: new Date(),
      },
    });

    let pendingPaymentStatus = await tx.status.findUnique({
      where: { code: 'PENDING_PAYMENT' },
    });
    if (!pendingPaymentStatus) {
      pendingPaymentStatus = await tx.status.findFirst();
    }

    await tx.user.update({
      where: { id: leaderUser.id },
      data: {
        wa_number: input.leaderInfo.whatsapp,
        institution_name: input.leaderInfo.institution,
      },
    });

    const team = await tx.team.create({
      data: {
        name: normalizedTeamName,
        code: selectedCodeRecord.code,
        leaderId: leaderUser.id,
        programId: ibccProgram.id,
        status: pendingPaymentStatus?.id ?? 15,
        memberComposition: input.memberComposition,
        sourceInfo: input.sourceInfo,
      },
    });

    await tx.teamMember.create({
      data: {
        teamId: team.id,
        userId: leaderUser.id,
        role: 'LEADER',
        institution: input.leaderInfo.institution,
        yearOfStudy: input.leaderInfo.yearOfStudy,
      },
    });

    for (const memberInput of input.members || []) {
      const email = memberInput.email.toLowerCase().trim();
      let targetUser = await tx.user.findUnique({ where: { email } });

      if (!targetUser) {
        targetUser = await tx.user.create({
          data: {
            name: memberInput.fullName.trim(),
            email,
            password: placeholderPasswords.get(email)!,
            status: 1,
            role: 'USER',
            wa_number: memberInput.whatsapp,
            institution_name: memberInput.institution,
          },
        });
      }

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: targetUser.id,
          role: 'MEMBER',
          institution: memberInput.institution,
          yearOfStudy: memberInput.yearOfStudy,
        },
      });
    }

    // Files are already on local disk; Drive upload happens afterwards in the background.
    const requirementFileMappings = [
      { event: 'IBCC_REQUIREMENT_KTM', type: 'IDCARD' as const, file: files.ktm_file[0] },
      { event: 'IBCC_REQUIREMENT_FOLLOW', type: 'PROMOTION' as const, file: files.follow_proof[0] },
      { event: 'IBCC_REQUIREMENT_TWIBBON', type: 'PROMOTION' as const, file: files.twibbon_proof[0] },
      { event: 'IBCC_REQUIREMENT_POSTER', type: 'PROMOTION' as const, file: files.poster_proof[0] },
      { event: 'IBCC_REQUIREMENT_BROADCAST', type: 'PROMOTION' as const, file: files.broadcast_proof[0] },
    ];

    const pendingFileIds: number[] = [];
    for (const item of requirementFileMappings) {
      const submission = await tx.submission.create({
        data: {
          teamId: team.id,
          userId: leaderUser.id,
          programId: ibccProgram.id,
          stage: 'REGISTRATION',
          event: item.event,
          type: item.type,
          // The official submission time is when the request arrived, not when Drive finished.
          submittedAt: receivedAt,
          Files: {
            create: {
              filePath: pendingFilePath(item.file),
              fileType: item.file.mimetype,
              fileSize: item.file.size,
            },
          },
        },
        include: { Files: { select: { id: true } } },
      });
      pendingFileIds.push(...submission.Files.map((f) => f.id));
    }

    await tx.masterTeamCode.update({
      where: { id: selectedCodeRecord.id },
      data: {
        status: 'ASSIGNED',
        assignedAt: new Date(),
        teamId: team.id,
      },
    });

    return {
      team,
      teamCode: selectedCodeRecord.code,
      pendingFileIds,
    };
  }, {
    maxWait: 15000,
    timeout: 20000,
  });

  result.pendingFileIds.forEach(enqueueDriveUpload);

  const leaderEmailHtml = renderTeamRegistrationConfirmationEmail({
    leaderName: leaderUser.name,
    teamName: result.team.name,
    teamCode: result.teamCode,
    memberCount: 1 + (input.members || []).length,
  });

  sendMail({
    to: leaderUser.email,
    subject: `Registration Confirmed - Team ${result.team.name} [${result.teamCode}] | IBCC 2026`,
    html: leaderEmailHtml,
  }).catch((err) => {
    console.error(`[IBCC] Leader confirmation email error: ${err.message}`);
  });

  return {
    teamId: result.team.id,
    teamName: result.team.name,
    teamCode: result.teamCode,
    driveFolderId: null,
    driveFolderUrl: null,
    filesProcessing: true,
    status: 'REGISTERED',
    memberCount: 1 + (input.members || []).length,
    waGroupLink: null,
  };
}

const isPendingFile = (file: { gdriveId: string | null; filePath: string }) =>
  !file.gdriveId && file.filePath.startsWith(PENDING_PREFIX);

export async function getMyTeam(userId: number) {
  // Single query joins all related models to eliminate N+1 roundtrips.
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { leaderId: userId },
        { TeamMember: { some: { userId } } },
      ],
    },
    include: {
      leader: {
        select: {
          id: true,
          name: true,
          email: true,
          wa_number: true,
          institution_name: true,
          major: true,
        },
      },
      TeamMember: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              wa_number: true,
            },
          },
        },
      },
      statuscode: true,
      masterTeamCode: true,
      submissionTeam: {
        include: {
          Files: true,
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  const isLeader = team.leaderId === userId;
  const nonLeaderMembers = team.TeamMember.filter(
    (tm) => tm.userId !== team.leaderId,
  ).map((tm) => ({
    id: tm.user.id,
    name: tm.user.name,
    email: tm.user.email,
    institution: tm.institution,
    yearOfStudy: tm.yearOfStudy,
  }));

  const preliminarySubmission = team.submissionTeam.find(
    (s) => s.stage === 'PREELIM' && s.type === 'TASK',
  );

  const paymentSubmission = team.submissionTeam.find(
    (s) => s.type === 'PAYMENT',
  );

  const statusCode = team.statuscode?.code || 'PENDING_PAYMENT';
  const isQualified =
    statusCode === 'QUALIFIED_FINAL' || statusCode === 'QUALIFIED_SEMIFINAL';
  const isEliminated =
    statusCode === 'ELIMINATED_PRELIMINARY' || statusCode === 'ELIMINATED_SEMIFINAL';

  let announcementMessage: string | null = null;
  if (isQualified) {
    announcementMessage =
      'Congratulations! Your team has qualified for the next stage.';
  } else if (isEliminated) {
    announcementMessage =
      'Thank you for your hard work and participation in IBCC 2026. Sadly, your team did not advance to the Semifinal round.';
  }

  const competitionStage = preliminarySubmission
    ? 'PREELIM'
    : isQualified
      ? 'SEMIFINAL'
      : 'REGISTRATION';

  const paymentFile = paymentSubmission?.Files?.[0];
  const pendingFileCount = team.submissionTeam
    .flatMap((s) => s.Files)
    .filter(isPendingFile).length;

  let paymentStatus = 'NOT_SUBMITTED';
  if (statusCode === 'PAID') {
    paymentStatus = 'PAID';
  } else if (statusCode === 'REJECTED_PAYMENT') {
    paymentStatus = 'REJECTED';
  } else if (paymentSubmission) {
    paymentStatus = 'PENDING_VERIFICATION';
  }

  return {
    id: team.id,
    name: team.name,
    code: team.code,
    status: preliminarySubmission ? 'PRELIMINARY_SUBMITTED' : statusCode,
    isLeader,
    competitionStage,
    payment: {
      status: paymentStatus,
      isUploaded: Boolean(paymentSubmission),
      fileUrl: paymentFile && !isPendingFile(paymentFile) ? paymentFile.filePath : null,
      isProcessing: Boolean(paymentFile && isPendingFile(paymentFile)),
      submittedAt: paymentSubmission?.submittedAt || null,
    },
    selectionResult: {
      isAnnounced: isQualified || isEliminated,
      isQualified,
      announcementMessage,
    },
    leader: {
      id: team.leader.id,
      name: team.leader.name,
      email: team.leader.email,
      institution: team.leader.institution_name,
    },
    members: nonLeaderMembers,
    submissions: {
      requirementsCompleted: team.submissionTeam.some(
        (s) => s.stage === 'REGISTRATION' && s.type !== 'PAYMENT',
      ),
      paymentSubmitted: Boolean(paymentSubmission),
      paymentSubmittedAt: paymentSubmission?.submittedAt || null,
      preliminaryOutputSubmitted: Boolean(preliminarySubmission),
      preliminarySubmittedAt: preliminarySubmission?.submittedAt || null,
      // True while any uploaded file is still being copied to Google Drive.
      filesProcessing: pendingFileCount > 0,
      pendingFileCount,
    },
  };
}

export async function submitPreliminarySlideDeck(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
  receivedAt: Date = new Date(),
) {
  const team = await prisma.team.findFirst({
    where: {
      leaderId: leaderUserId,
      ...(teamIdInput ? { id: teamIdInput } : {}),
    },
  });

  if (!team) {
    throw new Error('You are not the leader of an active IBCC team or team was not found.');
  }

  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'PREELIM',
      event: 'IBCC_PRELIMINARY_OUTPUT',
      type: 'TASK',
      submittedAt: receivedAt,
      Files: {
        create: {
          filePath: pendingFilePath(file),
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  submission.Files.forEach((f) => enqueueDriveUpload(f.id));

  return {
    submissionId: submission.id,
    stage: submission.stage,
    submittedAt: submission.submittedAt,
    fileUrl: null,
    gdriveId: null,
    filesProcessing: true,
  };
}

export async function submitSemifinalSlideDeck(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
  receivedAt: Date = new Date(),
) {
  const team = await prisma.team.findFirst({
    where: {
      leaderId: leaderUserId,
      ...(teamIdInput ? { id: teamIdInput } : {}),
    },
  });

  if (!team) {
    throw new Error('You are not the leader of an active IBCC team or team was not found.');
  }

  // The SlideDeck row is created by the Drive worker once the link exists.
  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'SEMIFINAL',
      event: 'IBCC',
      type: 'TASK',
      submittedAt: receivedAt,
      Files: {
        create: {
          filePath: pendingFilePath(file),
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  submission.Files.forEach((f) => enqueueDriveUpload(f.id));

  return {
    submissionId: submission.id,
    stage: submission.stage,
    submittedAt: submission.submittedAt,
    fileUrl: null,
    gdriveId: null,
    filesProcessing: true,
  };
}

export async function submitPaymentProof(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
  receivedAt: Date = new Date(),
) {
  const team = await prisma.team.findFirst({
    where: {
      leaderId: leaderUserId,
      ...(teamIdInput ? { id: teamIdInput } : {}),
    },
  });

  if (!team) {
    throw new Error('You are not the leader of an active IBCC team or team was not found.');
  }

  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'REGISTRATION',
      event: 'IBCC',
      type: 'PAYMENT',
      submittedAt: receivedAt,
      Files: {
        create: {
          filePath: pendingFilePath(file),
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  submission.Files.forEach((f) => enqueueDriveUpload(f.id));

  return {
    submissionId: submission.id,
    stage: submission.stage,
    type: submission.type,
    submittedAt: submission.submittedAt,
    fileUrl: null,
    gdriveId: null,
    filesProcessing: true,
  };
}

export async function submitScore(
  judgeId: number,
  teamId: number,
  score: number,
  comment?: string,
) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error('Team not found.');

  const existing = await prisma.semifinalScore.findFirst({
    where: { teamId, judgeId },
  });

  let semifinalScore;
  if (existing) {
    semifinalScore = await prisma.semifinalScore.update({
      where: { id: existing.id },
      data: { score, comment },
    });
  } else {
    semifinalScore = await prisma.semifinalScore.create({
      data: { teamId, judgeId, score, comment },
    });
  }

  await prisma.activityLog.create({
    data: {
      staffId: judgeId,
      activity: `Scored team ${team.name}: ${score}/100${comment ? ` – ${comment}` : ''}`,
      status: 'scored',
    },
  });

  return { semifinalScore, isUpdated: Boolean(existing) };
}

export async function getScores() {
  const scores = await prisma.semifinalScore.findMany({
    include: {
      team: { select: { id: true, name: true } },
      judge: { select: { id: true, name: true } },
    },
    orderBy: { score: 'desc' },
  });

  const teamScoresMap = new Map<
    number,
    {
      teamId: number;
      teamName: string;
      scores: { judgeId: number; judgeName: string; score: number; comment: string | null }[];
      average: number;
    }
  >();

  for (const s of scores) {
    if (!teamScoresMap.has(s.teamId)) {
      teamScoresMap.set(s.teamId, {
        teamId: s.teamId,
        teamName: s.team.name,
        scores: [],
        average: 0,
      });
    }
    const entry = teamScoresMap.get(s.teamId)!;
    entry.scores.push({
      judgeId: s.judgeId,
      judgeName: s.judge.name,
      score: s.score,
      comment: s.comment,
    });
  }

  const result = Array.from(teamScoresMap.values()).map((entry) => {
    const avg =
      entry.scores.reduce((sum, s) => sum + s.score, 0) / entry.scores.length;
    return { ...entry, average: Math.round(avg * 100) / 100 };
  });

  result.sort((a, b) => b.average - a.average);

  return { rankings: result };
}

export async function publishResults(qualifiedTeamIds: number[]) {
  const allScoredTeamIds = await prisma.semifinalScore
    .findMany({ select: { teamId: true }, distinct: ['teamId'] })
    .then((rows: { teamId: number }[]) => rows.map((r: { teamId: number }) => r.teamId));

  const eliminatedTeamIds = allScoredTeamIds.filter(
    (id: number) => !qualifiedTeamIds.includes(id),
  );

  let qualifiedStatus = await prisma.status.findUnique({ where: { code: 'QUALIFIED_FINAL' } });
  if (!qualifiedStatus) {
    qualifiedStatus = await prisma.status.create({
      data: { code: 'QUALIFIED_FINAL', description: 'Qualified to Final Round' },
    });
  }

  let eliminatedStatus = await prisma.status.findUnique({ where: { code: 'ELIMINATED_SEMIFINAL' } });
  if (!eliminatedStatus) {
    eliminatedStatus = await prisma.status.create({
      data: { code: 'ELIMINATED_SEMIFINAL', description: 'Eliminated in Semifinal' },
    });
  }

  await prisma.team.updateMany({
    where: { id: { in: qualifiedTeamIds } },
    data: { status: qualifiedStatus.id },
  });

  await prisma.team.updateMany({
    where: { id: { in: eliminatedTeamIds } },
    data: { status: eliminatedStatus.id },
  });

  sendSemifinalResultEmails(qualifiedTeamIds, eliminatedTeamIds).catch((err) =>
    console.error('[SEMIFINAL] Email sending error:', err),
  );

  return {
    qualified: qualifiedTeamIds,
    eliminated: eliminatedTeamIds,
  };
}

export async function getAllTeamsForAdmin() {
  const teams = await prisma.team.findMany({
    include: {
      leader: {
        select: {
          id: true,
          name: true,
          email: true,
          wa_number: true,
          institution_name: true,
          major: true,
        },
      },
      TeamMember: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              wa_number: true,
              institution_name: true,
              major: true,
            },
          },
        },
      },
      statuscode: true,
      submissionTeam: {
        include: {
          Files: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return teams;
}

export async function evaluatePreliminaryRound(
  teamId: number,
  status: 'passed' | 'failed',
  feedback?: string,
  score?: number,
  staffId?: number,
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { leader: true },
  });

  if (!team) {
    throw new Error('Team not found.');
  }

  const newStatusCode = status === 'passed' ? 'PASSED_PRELIMINARY' : 'FAILED_PRELIMINARY';

  let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });
  if (!statusRecord) {
    statusRecord = await prisma.status.create({
      data: {
        code: newStatusCode,
        description: status === 'passed' ? 'Passed Preliminary Round' : 'Failed Preliminary Round',
      },
    });
  }

  const updatedTeam = await prisma.team.update({
    where: { id: teamId },
    data: {
      status: statusRecord.id,
      score: score ?? team.score,
    },
    include: { statuscode: true, leader: true },
  });

  if (staffId) {
    await prisma.activityLog.create({
      data: {
        staffId,
        activity: `Evaluated team ${team.name} as ${status} with score ${score ?? team.score ?? 'N/A'}`,
        status,
      },
    });
  }

  if (team.leader?.email) {
    const subject =
      status === 'passed'
        ? '[SXC Intersummit 2026] Congratulations! You passed the Preliminary Round!'
        : '[SXC Intersummit 2026] Preliminary Round Results';

    const html = renderPreliminaryEvaluationEmail({
      leaderName: team.leader.name || 'Participant',
      teamName: team.name,
      status,
      score,
      feedback,
    });

    const mailResult = await sendMail({
      to: team.leader.email,
      subject,
      html,
      text:
        status === 'passed'
          ? `Congratulations! Your team ${team.name} has passed the Preliminary Round.`
          : `Thank you for participating. Your team ${team.name} did not advance past the Preliminary Round.`,
    });

    await prisma.emailLog.create({
      data: {
        toEmail: team.leader.email,
        subject,
        template: status === 'passed' ? 'preliminary_passed' : 'preliminary_failed',
        status: mailResult.success ? 'success' : 'failed',
      },
    });
  }

  return updatedTeam;
}


