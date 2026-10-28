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

const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{6,10}$/;

export const memberItemSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.email('Please enter a valid email address').trim().toLowerCase(),
  whatsapp: z.string().trim().regex(phoneRegex, 'Please enter a valid WhatsApp number (e.g. 08123456789 or +628123456789)'),
  institution: z.string().trim().min(3, 'Institution and major are required'),
  yearOfStudy: yearOfStudyEnum,
});

export const leaderInfoSchema = z.object({
  whatsapp: z.string().trim().regex(phoneRegex, 'Please enter a valid WhatsApp number (e.g. 08123456789 or +628123456789)'),
  institution: z.string().trim().min(3, 'Institution and major are required'),
  yearOfStudy: yearOfStudyEnum,
});

export const registerTeamSchema = z.object({
  teamName: z.string().trim().min(3, 'Team name must be at least 3 characters').max(50, 'Team name cannot exceed 50 characters'),
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

export const submitScoreSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  score: z.coerce.number().min(0, "Score must be >= 0").max(100, "Score must be <= 100"),
  comment: z.string().trim().max(500).optional(),
});

export const publishResultsSchema = z.object({
  qualifiedTeamIds: z.array(z.coerce.number().int().positive()).min(1, "At least 1 qualified team is required"),
});

export const teamIdParamSchema = z.object({
  teamId: z.coerce.number().int().positive('teamId must be a positive integer'),
});

export const updatePreliminaryStatusSchema = z.object({
  status: z.literal('passed').or(z.literal('failed')),
  feedback: z.string().trim().optional(),
  score: z.coerce.number().min(0, 'Score cannot be negative').max(100, 'Score cannot exceed 100').optional(),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
export type PublishResultsInput = z.infer<typeof publishResultsSchema>;
export type UpdatePreliminaryStatusInput = z.infer<typeof updatePreliminaryStatusSchema>;
