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
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
};

const parseBoolean = (val: unknown) => {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === '1' || lower === 'on' || lower === 'agree' || lower === 'confirm') return true;
    if (lower === 'false' || lower === 'no' || lower === '0' || lower === 'off') return false;
  }
  return val;
};

const normalizePhone = (val: unknown) => {
  if (typeof val === 'string') {
    return val.replace(/[\s\-]/g, '');
  }
  return val;
};

const normalizeMemberComposition = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const clean = val.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  if (clean.includes('SAME')) return 'SAME_UNIVERSITY';
  if (clean.includes('MULTIPLE')) return 'MULTIPLE_UNIVERSITIES';
  return clean;
};

const normalizeSourceInfo = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const clean = val.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  if (clean === 'COMMUNITY_OR_MEDIA_PARTNER') return 'COMMUNITY_MEDIA_PARTNER';
  if (clean === 'FRIENDS_AND_FAMILY') return 'FRIENDS_FAMILY';
  return clean;
};

const normalizeYearOfStudy = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const clean = val.trim().toLowerCase();
  if (clean.startsWith('1')) return '1st year';
  if (clean.startsWith('2')) return '2nd year';
  if (clean.startsWith('3')) return '3rd year';
  if (clean.startsWith('4')) return '4th year';
  return clean;
};

function preprocessEducation(val: unknown) {
  if (val && typeof val === 'object') {
    const obj = { ...(val as Record<string, unknown>) };
    if ((!obj.major || (typeof obj.major === 'string' && !obj.major.trim())) && typeof obj.institution === 'string') {
      const parts = obj.institution.split(/\s*[-/]\s*/);
      if (parts.length > 1 && parts[1].trim().length >= 2) {
        obj.institution = parts[0].trim();
        obj.major = parts.slice(1).join(' - ').trim();
      }
    }
    return obj;
  }
  return val;
}

const phoneRegex = /^(\+?[1-9]\d{7,14}|08[1-9]\d{6,10})$/;
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Please enter a valid email address'));

export const memberItemSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: emailSchema,
  whatsapp: z.preprocess(
    normalizePhone,
    z.string().trim().regex(phoneRegex, 'Please enter a valid WhatsApp number (e.g. 08123456789 or +628123456789)'),
  ),
  institution: z.string().trim().min(2, 'Institution is required'),
  major: z.string().trim().min(2, 'Major is required'),
  yearOfStudy: z.preprocess(normalizeYearOfStudy, yearOfStudyEnum),
});

export const leaderInfoSchema = z.object({
  whatsapp: z.preprocess(
    normalizePhone,
    z.string().trim().regex(phoneRegex, 'Please enter a valid WhatsApp number (e.g. 08123456789 or +628123456789)'),
  ),
  institution: z.string().trim().min(2, 'Institution is required'),
  major: z.string().trim().min(2, 'Major is required'),
  yearOfStudy: z.preprocess(normalizeYearOfStudy, yearOfStudyEnum),
});

export const registerTeamSchema = z.object({
  teamName: z.string().trim().min(3, 'Team name must be at least 3 characters').max(50, 'Team name cannot exceed 50 characters'),
  memberComposition: z.preprocess(normalizeMemberComposition, memberCompositionEnum),
  sourceInfo: z.preprocess(normalizeSourceInfo, sourceInfoEnum),
  leaderInfo: z.preprocess(
    (val) => preprocessEducation(parseJsonIfString(val)),
    leaderInfoSchema,
  ),
  members: z.preprocess(
    (val) => {
      const parsed = parseJsonIfString(val);
      if (!parsed) return [];
      if (Array.isArray(parsed)) {
        return parsed.map((item) => preprocessEducation(item));
      }
      return parsed;
    },
    z.array(memberItemSchema).max(2, 'Maximum 2 additional members allowed').default([]),
  ),
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
