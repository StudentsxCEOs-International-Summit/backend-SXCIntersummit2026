import { z } from 'zod';

export const yearOfStudyEnum = z.enum(['1st year', '2nd year', '3rd year', '4th year']);
export const memberCompositionEnum = z.enum(['SAME_UNIVERSITY', 'MULTIPLE_UNIVERSITIES']);
export const sourceInfoEnum = z.enum([
  'INSTAGRAM',
  'TIKTOK',
  'X',
  'LINKEDIN',
  'FRIENDS_FAMILY',
  'COMMUNITY_MEDIA_PARTNER',
  'OTHERS',
]);

const parseJsonIfString = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

const parseBoolean = (val: unknown) => {
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
};

export const verifyMemberTokenQuerySchema = z.object({
  token: z.string().min(1, 'Activation token is required'),
});

export const claimMemberAccountSchema = z.object({
  token: z.string().min(1, 'Activation token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const memberItemSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.email('Invalid email address'),
  whatsapp: z.string().min(8, 'Valid WhatsApp number is required'),
  institution: z.string().min(3, 'Institution and Major are required'),
  yearOfStudy: yearOfStudyEnum,
});

export const leaderInfoSchema = z.object({
  whatsapp: z.string().min(8, 'Valid WhatsApp number is required'),
  institution: z.string().min(3, 'Institution and Major are required'),
  yearOfStudy: yearOfStudyEnum,
});

export const registerTeamSchema = z.object({
  teamName: z.string().min(3, 'Team name must be at least 3 characters').max(50),
  memberComposition: memberCompositionEnum,
  sourceInfo: sourceInfoEnum,
  leaderInfo: z.preprocess(parseJsonIfString, leaderInfoSchema),
  members: z.preprocess(
    parseJsonIfString,
    z.array(memberItemSchema).max(2, 'Maximum 2 additional members allowed'),
  ).default([]),
  agreeTerms: z.preprocess(
    parseBoolean,
    z.literal(true, {
      message: 'You must agree to the Terms & Conditions',
    }),
  ),
  confirmParticipation: z.preprocess(
    parseBoolean,
    z.literal(true, {
      message: 'You must confirm participation commitment',
    }),
  ),
});

export type RegisterTeamInput = z.infer<typeof registerTeamSchema>;
export type ClaimMemberAccountInput = z.infer<typeof claimMemberAccountSchema>;
