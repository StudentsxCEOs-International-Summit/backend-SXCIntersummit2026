import crypto from 'crypto';
import path from 'path';
import prisma from '../../configs/db';
import { env } from '../../configs/env';
import { hashPassword } from '../../utils/bcrypt';
import { sendMail } from '../../services/mail.service';
import {
  getOrCreateTeamFolder,
  uploadBufferToDrive,
} from '../../services/storage.service';
import {
  renderTeamRegistrationConfirmationEmail,
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
        const placeholderPassword = await hashPassword(
          crypto.randomBytes(24).toString('hex'),
        );
        targetUser = await tx.user.create({
          data: {
            name: memberInput.fullName.trim(),
            email,
            password: placeholderPassword,
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

    const sanitizedTeamName = normalizedTeamName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedLeaderName = leaderUser.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const teamFolderId = await getOrCreateTeamFolder(selectedCodeRecord.code, normalizedTeamName);

    const [ktmUpload, followUpload, twibbonUpload, posterUpload, broadcastUpload] =
      await Promise.all([
        uploadBufferToDrive(
          files.ktm_file[0].buffer,
          `KTM_${sanitizedLeaderName}${path.extname(files.ktm_file[0].originalname) || '.pdf'}`,
          files.ktm_file[0].mimetype,
          teamFolderId,
        ),
        uploadBufferToDrive(
          files.follow_proof[0].buffer,
          `Follow_Instagram_${sanitizedTeamName}${path.extname(files.follow_proof[0].originalname) || '.pdf'}`,
          files.follow_proof[0].mimetype,
          teamFolderId,
        ),
        uploadBufferToDrive(
          files.twibbon_proof[0].buffer,
          `Twibbon_${sanitizedTeamName}${path.extname(files.twibbon_proof[0].originalname) || '.pdf'}`,
          files.twibbon_proof[0].mimetype,
          teamFolderId,
        ),
        uploadBufferToDrive(
          files.poster_proof[0].buffer,
          `Share_Poster_${sanitizedTeamName}${path.extname(files.poster_proof[0].originalname) || '.pdf'}`,
          files.poster_proof[0].mimetype,
          teamFolderId,
        ),
        uploadBufferToDrive(
          files.broadcast_proof[0].buffer,
          `Share_Broadcast_${sanitizedTeamName}${path.extname(files.broadcast_proof[0].originalname) || '.pdf'}`,
          files.broadcast_proof[0].mimetype,
          teamFolderId,
        ),
      ]);

    const requirementFileMappings = [
      { event: 'IBCC_REQUIREMENT_KTM', type: 'IDCARD' as const, file: files.ktm_file[0], upload: ktmUpload },
      { event: 'IBCC_REQUIREMENT_FOLLOW', type: 'PROMOTION' as const, file: files.follow_proof[0], upload: followUpload },
      { event: 'IBCC_REQUIREMENT_TWIBBON', type: 'PROMOTION' as const, file: files.twibbon_proof[0], upload: twibbonUpload },
      { event: 'IBCC_REQUIREMENT_POSTER', type: 'PROMOTION' as const, file: files.poster_proof[0], upload: posterUpload },
      { event: 'IBCC_REQUIREMENT_BROADCAST', type: 'PROMOTION' as const, file: files.broadcast_proof[0], upload: broadcastUpload },
    ];

    for (const item of requirementFileMappings) {
      await tx.submission.create({
        data: {
          teamId: team.id,
          userId: leaderUser.id,
          programId: ibccProgram.id,
          stage: 'REGISTRATION',
          event: item.event,
          type: item.type,
          Files: {
            create: {
              filePath: item.upload.webViewLink,
              gdriveId: item.upload.fileId,
              fileType: item.file.mimetype,
              fileSize: item.file.size,
            },
          },
        },
      });
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
      teamFolderId,
    };
  }, {
    maxWait: 15000,
    timeout: 60000,
  });

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
    driveFolderId: result.teamFolderId,
    driveFolderUrl: `https://drive.google.com/drive/folders/${result.teamFolderId}`,
    status: 'REGISTERED',
    memberCount: 1 + (input.members || []).length,
    waGroupLink: null,
  };
}

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
      fileUrl: paymentSubmission?.Files?.[0]?.filePath || null,
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
    },
  };
}

export async function submitPreliminarySlideDeck(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
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

  const targetFolderId =
    env.GOOGLE_DRIVE_FOLDER_PRELIMINARY_ID ||
    env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
    env.GOOGLE_DRIVE_FOLDER_ID;

  if (!targetFolderId) {
    throw new Error('Google Drive Preliminary folder ID is not configured.');
  }

  const ext = path.extname(file.originalname) || '.pdf';
  const sanitizedTeamName = team.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `[${team.code}]_${sanitizedTeamName}_Preliminary${ext}`;

  const uploadResult = await uploadBufferToDrive(
    file.buffer,
    fileName,
    file.mimetype,
    targetFolderId,
  );

  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'PREELIM',
      event: 'IBCC_PRELIMINARY_OUTPUT',
      type: 'TASK',
      Files: {
        create: {
          filePath: uploadResult.webViewLink,
          gdriveId: uploadResult.fileId,
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  return {
    submissionId: submission.id,
    stage: submission.stage,
    submittedAt: submission.submittedAt,
    fileUrl: uploadResult.webViewLink,
    gdriveId: uploadResult.fileId,
  };
}

export async function submitSemifinalSlideDeck(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
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

  const targetFolderId =
    env.GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID ||
    env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
    env.GOOGLE_DRIVE_FOLDER_ID;

  if (!targetFolderId) {
    throw new Error('Google Drive Semifinal Slides folder ID is not configured.');
  }

  const ext = path.extname(file.originalname) || '.pdf';
  const sanitizedTeamName = team.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `[${team.code}]_${sanitizedTeamName}_Semifinal_Slides${ext}`;

  const uploadResult = await uploadBufferToDrive(
    file.buffer,
    fileName,
    file.mimetype,
    targetFolderId,
  );

  await prisma.slideDeck.create({
    data: {
      teamId: team.id,
      fileUrl: uploadResult.webViewLink,
    },
  });

  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'SEMIFINAL',
      event: 'IBCC',
      type: 'TASK',
      Files: {
        create: {
          filePath: uploadResult.webViewLink,
          gdriveId: uploadResult.fileId,
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  return {
    submissionId: submission.id,
    stage: submission.stage,
    submittedAt: submission.submittedAt,
    fileUrl: uploadResult.webViewLink,
    gdriveId: uploadResult.fileId,
  };
}

export async function submitPaymentProof(
  leaderUserId: number,
  file: Express.Multer.File,
  teamIdInput?: number,
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

  const targetFolderId =
    env.GOOGLE_DRIVE_FOLDER_PAYMENT_ID ||
    env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
    env.GOOGLE_DRIVE_FOLDER_ID;

  if (!targetFolderId) {
    throw new Error('Google Drive Payment folder ID is not configured.');
  }

  const ext = path.extname(file.originalname) || '.jpg';
  const sanitizedTeamName = team.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `[${team.code}]_${sanitizedTeamName}_PaymentProof${ext}`;

  const uploadResult = await uploadBufferToDrive(
    file.buffer,
    fileName,
    file.mimetype,
    targetFolderId,
  );

  const submission = await prisma.submission.create({
    data: {
      teamId: team.id,
      userId: leaderUserId,
      programId: team.programId,
      stage: 'REGISTRATION',
      event: 'IBCC',
      type: 'PAYMENT',
      Files: {
        create: {
          filePath: uploadResult.webViewLink,
          gdriveId: uploadResult.fileId,
          fileType: file.mimetype,
          fileSize: file.size,
        },
      },
    },
    include: {
      Files: true,
    },
  });

  return {
    submissionId: submission.id,
    stage: submission.stage,
    type: submission.type,
    submittedAt: submission.submittedAt,
    fileUrl: uploadResult.webViewLink,
    gdriveId: uploadResult.fileId,
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

