import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateMyTeamSchema } from '../src/features/ibcc/ibcc.schema';
import { assertTeamEditAccess, IbccServiceError } from '../src/features/ibcc/ibcc.policy';

test('updateMyTeamSchema accepts valid partial leader and member updates and normalizes phone/year', () => {
  const result = updateMyTeamSchema.safeParse({
    leader: {
      fullName: '  Muhammad Azka  ',
      whatsapp: '\u200E+62 812-3456-7890',
      institution: 'Universitas Padjadjaran',
      major: 'Bisnis Digital',
      yearOfStudy: '1st Year',
    },
    members: [
      {
        userId: 15,
        fullName: 'Jane Doe',
        whatsapp: '081298765432',
        yearOfStudy: '3',
      },
    ],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.leader?.fullName, 'Muhammad Azka');
    assert.equal(result.data.leader?.whatsapp, '081234567890');
    assert.equal(result.data.leader?.yearOfStudy, '1st year');
    assert.equal(result.data.members?.[0].userId, 15);
    assert.equal(result.data.members?.[0].yearOfStudy, '3rd year');
  }
});

test('updateMyTeamSchema rejects immutable fields (teamName, code, email) anywhere in payload', () => {
  const withTeamName = updateMyTeamSchema.safeParse({
    teamName: 'Renamed Team',
    leader: { fullName: 'Valid Name' },
  });
  assert.equal(withTeamName.success, false);

  const withLeaderEmail = updateMyTeamSchema.safeParse({
    leader: { fullName: 'Valid Name', email: 'hijack@example.com' },
  });
  assert.equal(withLeaderEmail.success, false);

  const withMemberEmail = updateMyTeamSchema.safeParse({
    members: [{ userId: 15, fullName: 'Jane Doe', email: 'hijack@example.com' }],
  });
  assert.equal(withMemberEmail.success, false);
});

test('updateMyTeamSchema rejects empty payload, empty member patch, or duplicate member userId', () => {
  assert.equal(updateMyTeamSchema.safeParse({}).success, false);
  assert.equal(updateMyTeamSchema.safeParse({ leader: {} }).success, false);
  assert.equal(updateMyTeamSchema.safeParse({ members: [{ userId: 15 }] }).success, false);
  assert.equal(
    updateMyTeamSchema.safeParse({
      members: [
        { userId: 15, fullName: 'Name One' },
        { userId: 15, fullName: 'Name Two' },
      ],
    }).success,
    false,
  );
});

test('assertTeamEditAccess enforces 404 without team, 403 for non-leaders, and 403 against member IDOR', () => {
  assert.throws(
    () => assertTeamEditAccess(null, 12, []),
    (err: unknown) => err instanceof IbccServiceError && err.statusCode === 404,
  );

  const teamSnapshot = {
    id: 42,
    leaderId: 12,
    TeamMember: [
      { userId: 12, role: 'LEADER' },
      { userId: 15, role: 'MEMBER' },
      { userId: 18, role: 'MEMBER' },
    ],
  };

  assert.throws(
    () => assertTeamEditAccess(teamSnapshot, 15, [15]),
    (err: unknown) => err instanceof IbccServiceError && err.statusCode === 403,
  );

  assert.throws(
    () => assertTeamEditAccess(teamSnapshot, 12, [999]),
    (err: unknown) => err instanceof IbccServiceError && err.statusCode === 403,
  );

  assert.throws(
    () => assertTeamEditAccess(teamSnapshot, 12, [12]),
    (err: unknown) => err instanceof IbccServiceError && err.statusCode === 403,
  );

  assert.doesNotThrow(() => assertTeamEditAccess(teamSnapshot, 12, [15, 18]));
});
