import crypto from 'crypto';
import prisma from '../../configs/db';
import { env } from '../../configs/env';
import { hashPassword } from '../../utils/bcrypt';
import { signToken } from '../../utils/jwt';
import { sendMail } from '../../services/mail.service';
import { fileToPublicUrl } from '../../services/storage.service';
import {
  renderTeamRegistrationConfirmationEmail,
  renderMemberInvitationEmail,
} from './ibcc.templates';
import { RegisterTeamInput } from './ibcc.schema';

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

  const waGroupLink = 'https://chat.whatsapp.com/IBCC2026PreliminaryStageInvite';

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

    const pendingMemberInvitations: {
      name: string;
      email: string;
      token: string;
      code: string;
    }[] = [];

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

      const token = crypto.randomBytes(32).toString('hex');
      const fallbackCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await tx.teamMemberInvitation.create({
        data: {
          teamId: team.id,
          userId: targetUser.id,
          email,
          token,
          code: fallbackCode,
          expiresAt,
        },
      });

      pendingMemberInvitations.push({
        name: targetUser.name,
        email,
        token,
        code: fallbackCode,
      });
    }

    const requirementFileMappings = [
      { event: 'IBCC_REQUIREMENT_KTM', type: 'IDCARD' as const, file: files.ktm_file[0] },
      { event: 'IBCC_REQUIREMENT_FOLLOW', type: 'PROMOTION' as const, file: files.follow_proof[0] },
      { event: 'IBCC_REQUIREMENT_TWIBBON', type: 'PROMOTION' as const, file: files.twibbon_proof[0] },
      { event: 'IBCC_REQUIREMENT_POSTER', type: 'PROMOTION' as const, file: files.poster_proof[0] },
      { event: 'IBCC_REQUIREMENT_BROADCAST', type: 'PROMOTION' as const, file: files.broadcast_proof[0] },
    ];

    for (const item of requirementFileMappings) {
      const publicUrl = fileToPublicUrl(item.file);
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
              filePath: publicUrl,
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
      pendingMemberInvitations,
    };
  });

  const leaderEmailHtml = renderTeamRegistrationConfirmationEmail({
    leaderName: leaderUser.name,
    teamName: result.team.name,
    teamCode: result.teamCode,
    memberCount: 1 + (input.members || []).length,
    waGroupLink,
  });

  sendMail({
    to: leaderUser.email,
    subject: `Registration Confirmed - Team ${result.team.name} [${result.teamCode}] | IBCC 2026`,
    html: leaderEmailHtml,
  }).catch((err) => {
    console.error(`[IBCC] Leader confirmation email error: ${err.message}`);
  });

  const clientBaseUrl = process.env.CLIENT_URL || env.CORS_ORIGIN || 'https://intersummit.com';

  for (const invitation of result.pendingMemberInvitations) {
    const claimUrl = `${clientBaseUrl}/claim-team?token=${invitation.token}`;
    const memberEmailHtml = renderMemberInvitationEmail({
      memberName: invitation.name,
      leaderName: leaderUser.name,
      teamName: result.team.name,
      token: invitation.token,
      code: invitation.code,
      claimUrl,
    });

    sendMail({
      to: invitation.email,
      subject: `Team Invitation: ${result.team.name} | IBCC 2026`,
      html: memberEmailHtml,
    }).catch((err) => {
      console.error(`[IBCC] Member invitation email error (${invitation.email}): ${err.message}`);
    });
  }

  return {
    teamId: result.team.id,
    teamName: result.team.name,
    teamCode: result.teamCode,
    status: 'REGISTERED',
    memberCount: 1 + (input.members || []).length,
    waGroupLink,
  };
}

export async function verifyMemberToken(token: string) {
  const invitation = await prisma.teamMemberInvitation.findUnique({
    where: { token },
    include: {
      team: {
        include: {
          leader: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      user: {
        select: { id: true, name: true, email: true, createdAt: true },
      },
    },
  });

  if (!invitation) {
    throw new Error('Invalid or non-existent activation token.');
  }

  if (invitation.isClaimed) {
    throw new Error('This invitation has already been claimed.');
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new Error('This invitation token has expired.');
  }

  return {
    teamId: invitation.team.id,
    teamName: invitation.team.name,
    leaderName: invitation.team.leader.name,
    memberName: invitation.user.name,
    memberEmail: invitation.user.email,
    isAlreadyRegisteredUser: false,
  };
}

export async function claimMemberAccount(token: string, newPasswordPlain: string) {
  const invitation = await prisma.teamMemberInvitation.findUnique({
    where: { token },
    include: {
      team: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!invitation) {
    throw new Error('Invalid or non-existent activation token.');
  }

  if (invitation.isClaimed) {
    throw new Error('This invitation has already been claimed.');
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new Error('This invitation token has expired.');
  }

  const hashedPassword = await hashPassword(newPasswordPlain);

  const updatedUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: invitation.userId },
      data: { password: hashedPassword },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    await tx.teamMemberInvitation.update({
      where: { id: invitation.id },
      data: {
        isClaimed: true,
        claimedAt: new Date(),
      },
    });

    return user;
  });

  const accessToken = signToken(
    {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      accountType: 'user',
    },
    { expiresIn: env.JWT_EXPIRE as any },
  );

  return {
    accessToken,
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
    },
    team: {
      id: invitation.team.id,
      name: invitation.team.name,
      code: invitation.team.code,
    },
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

  return {
    id: team.id,
    name: team.name,
    code: team.code,
    status: preliminarySubmission ? 'PRELIMINARY_SUBMITTED' : statusCode,
    isLeader,
    competitionStage,
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
        (s) => s.stage === 'REGISTRATION',
      ),
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

  const fileUrl = fileToPublicUrl(file);

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
          filePath: fileUrl,
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
    fileUrl,
  };
}
