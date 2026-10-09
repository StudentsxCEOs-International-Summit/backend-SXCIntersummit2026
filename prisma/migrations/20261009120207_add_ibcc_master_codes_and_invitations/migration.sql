-- CreateEnum
CREATE TYPE "TeamCodeStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'RETIRED');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "memberComposition" TEXT,
ADD COLUMN     "sourceInfo" TEXT;

-- AlterTable
ALTER TABLE "teammember" ADD COLUMN     "institution" TEXT,
ADD COLUMN     "yearOfStudy" TEXT;

-- CreateTable
CREATE TABLE "master_team_code" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "status" "TeamCodeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "teamId" INTEGER,
    "reservedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),

    CONSTRAINT "master_team_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member_invitation" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_team_code_code_key" ON "master_team_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "master_team_code_teamId_key" ON "master_team_code"("teamId");

-- CreateIndex
CREATE INDEX "master_team_code_status_idx" ON "master_team_code"("status");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_invitation_token_key" ON "team_member_invitation"("token");

-- CreateIndex
CREATE INDEX "team_member_invitation_email_idx" ON "team_member_invitation"("email");

-- AddForeignKey
ALTER TABLE "master_team_code" ADD CONSTRAINT "master_team_code_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_invitation" ADD CONSTRAINT "team_member_invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_invitation" ADD CONSTRAINT "team_member_invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
