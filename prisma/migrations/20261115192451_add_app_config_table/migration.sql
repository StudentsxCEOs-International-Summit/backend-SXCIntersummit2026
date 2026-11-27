-- CreateTable
CREATE TABLE "app_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "registrationDeadline" TIMESTAMP(3) NOT NULL DEFAULT '2026-12-19 23:59:59+07'::timestamptz,
    "registrationExtendedDeadline" TIMESTAMP(3) NOT NULL DEFAULT '2026-12-30 23:59:59+07'::timestamptz,
    "extendedRegistrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxSlidePages" INTEGER NOT NULL DEFAULT 5,
    "maxSlideSizeMB" INTEGER NOT NULL DEFAULT 20,
    "deadlineReminderDays" INTEGER NOT NULL DEFAULT 3,
    "paymentReminderDays" INTEGER NOT NULL DEFAULT 3,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
