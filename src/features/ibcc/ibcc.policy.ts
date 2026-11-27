export type IbccClientErrorStatus = 403 | 404;

export class IbccServiceError extends Error {
  statusCode: IbccClientErrorStatus;

  constructor(statusCode: IbccClientErrorStatus, message: string) {
    super(message);
    this.name = 'IbccServiceError';
    this.statusCode = statusCode;
  }
}

export interface TeamEditTargetSnapshot {
  id: number;
  leaderId: number;
  TeamMember: Array<{ userId: number; role: 'LEADER' | 'MEMBER' }>;
}

/** Ensures only the team's leader can edit details and every member userId belongs to that team. */
export function assertTeamEditAccess(
  team: TeamEditTargetSnapshot | null,
  requesterUserId: number,
  requestedMemberIds: number[],
): asserts team is TeamEditTargetSnapshot {
  if (!team) {
    throw new IbccServiceError(404, 'No registered team found for this user.');
  }
  if (team.leaderId !== requesterUserId) {
    throw new IbccServiceError(403, 'Forbidden: only the team leader can update team details.');
  }

  const allowedMemberIds = new Set(
    team.TeamMember.filter((tm) => tm.userId !== team.leaderId && tm.role === 'MEMBER').map(
      (tm) => tm.userId,
    ),
  );

  for (const memberUserId of requestedMemberIds) {
    if (!allowedMemberIds.has(memberUserId)) {
      throw new IbccServiceError(
        403,
        `Forbidden: user ${memberUserId} is not a member of your team.`,
      );
    }
  }
}
