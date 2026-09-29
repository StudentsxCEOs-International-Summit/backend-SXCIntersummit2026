-- CreateEnum
CREATE TYPE "Institution" AS ENUM ('UNIV', 'HSC');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'BMC_ADMIN', 'BCL_ADMIN', 'IBCC_ADMIN', 'IBPC_ADMIN', 'CHAMBERS_ADMIN', 'COMPANY_VISIT_ADMIN', 'IC_ADMIN', 'PO');

-- CreateEnum
CREATE TYPE "Programtype" AS ENUM ('EVENT', 'COMPETITION');

-- CreateEnum
CREATE TYPE "teamrole" AS ENUM ('MEMBER', 'LEADER');

-- CreateEnum
CREATE TYPE "stages" AS ENUM ('REGISTRATION', 'PREELIM', 'SEMINAR', 'FINAL', 'SEMIFINAL');

-- CreateEnum
CREATE TYPE "submitType" AS ENUM ('IDCARD', 'PAYMENT', 'TASK', 'PROMOTION', 'CV');

-- CreateEnum
CREATE TYPE "regType" AS ENUM ('NONE', 'REGULAR', 'VIP', 'DAY1', 'DAY2', 'DAY1AND2');

-- CreateEnum
CREATE TYPE "purpose" AS ENUM ('notification', 'Announcement');

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "birthdate" TIMESTAMP(3),
    "domicile" TEXT,
    "institution_name" TEXT,
    "major" TEXT,
    "wa_number" TEXT,
    "line_id" TEXT,
    "insta_acc" TEXT,
    "institution" "Institution",
    "status" INTEGER NOT NULL DEFAULT 1,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activityLog" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" INTEGER NOT NULL,
    "purpose" "purpose" NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tempIndividu" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tempIndividu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaderId" INTEGER NOT NULL,
    "programId" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 15,
    "score" DOUBLE PRECISION,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "Programtype" NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeminarReg" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "programId" INTEGER NOT NULL,
    "status" INTEGER DEFAULT 2,
    "type" "regType" NOT NULL DEFAULT 'NONE',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeminarReg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" SERIAL NOT NULL,
    "seminarId" INTEGER,
    "teamId" INTEGER,
    "userId" INTEGER,
    "stage" "stages" NOT NULL,
    "event" TEXT NOT NULL,
    "type" "submitType" NOT NULL,
    "programId" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER,
    "fileType" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "gdriveId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingUserVerification" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "otp" TEXT NOT NULL,
    "otpSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otpTries" INTEGER NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "PendingUserVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programReferral" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "referralId" INTEGER NOT NULL,

    CONSTRAINT "programReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userReferral" (
    "userId" INTEGER NOT NULL,
    "referralId" INTEGER NOT NULL,

    CONSTRAINT "userReferral_pkey" PRIMARY KEY ("userId","referralId")
);

-- CreateTable
CREATE TABLE "blacklist" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teammember" (
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "teamrole" NOT NULL,

    CONSTRAINT "teammember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "addForm" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "programId" INTEGER,
    "registrationId" INTEGER NOT NULL,
    "onTime" BOOLEAN NOT NULL DEFAULT false,
    "wellOrganized" BOOLEAN NOT NULL DEFAULT false,
    "practicalInsights" BOOLEAN NOT NULL DEFAULT false,
    "interactiveSession" BOOLEAN NOT NULL DEFAULT false,
    "other" TEXT,
    "commitment" BOOLEAN DEFAULT false,
    "consent" BOOLEAN DEFAULT false,
    "concerns" TEXT,
    "linkedin" TEXT,
    "question" TEXT,
    "specificMaterial" TEXT,
    "gpa" DOUBLE PRECISION,

    CONSTRAINT "addForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearFrom" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "programId" INTEGER,
    "instagram" BOOLEAN NOT NULL DEFAULT false,
    "facebook" BOOLEAN NOT NULL DEFAULT false,
    "twitter" BOOLEAN NOT NULL DEFAULT false,
    "friends" BOOLEAN NOT NULL DEFAULT false,
    "family" BOOLEAN NOT NULL DEFAULT false,
    "other" TEXT,

    CONSTRAINT "hearFrom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideDeck" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemifinalScore" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "judgeId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemifinalScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_googleId_key" ON "user"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_institution_idx" ON "user"("institution");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tempIndividu_userId_key" ON "tempIndividu"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");

-- CreateIndex
CREATE UNIQUE INDEX "status_code_key" ON "status"("code");

-- CreateIndex
CREATE INDEX "status_code_idx" ON "status"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Program_name_key" ON "Program"("name");

-- CreateIndex
CREATE INDEX "Submission_stage_idx" ON "Submission"("stage");

-- CreateIndex
CREATE INDEX "Submission_type_idx" ON "Submission"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PendingUserVerification_email_key" ON "PendingUserVerification"("email");

-- CreateIndex
CREATE UNIQUE INDEX "referral_code_key" ON "referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "programReferral_programId_referralId_key" ON "programReferral"("programId", "referralId");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_token_key" ON "blacklist"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AccessCode_code_key" ON "AccessCode"("code");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_status_fkey" FOREIGN KEY ("status") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activityLog" ADD CONSTRAINT "activityLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tempIndividu" ADD CONSTRAINT "tempIndividu_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_status_fkey" FOREIGN KEY ("status") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeminarReg" ADD CONSTRAINT "SeminarReg_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeminarReg" ADD CONSTRAINT "SeminarReg_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeminarReg" ADD CONSTRAINT "SeminarReg_status_fkey" FOREIGN KEY ("status") REFERENCES "status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_seminarId_fkey" FOREIGN KEY ("seminarId") REFERENCES "SeminarReg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programReferral" ADD CONSTRAINT "programReferral_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programReferral" ADD CONSTRAINT "programReferral_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userReferral" ADD CONSTRAINT "userReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userReferral" ADD CONSTRAINT "userReferral_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammember" ADD CONSTRAINT "teammember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teammember" ADD CONSTRAINT "teammember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addForm" ADD CONSTRAINT "addForm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addForm" ADD CONSTRAINT "addForm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addForm" ADD CONSTRAINT "addForm_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "SeminarReg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearFrom" ADD CONSTRAINT "hearFrom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearFrom" ADD CONSTRAINT "hearFrom_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideDeck" ADD CONSTRAINT "SlideDeck_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemifinalScore" ADD CONSTRAINT "SemifinalScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemifinalScore" ADD CONSTRAINT "SemifinalScore_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
