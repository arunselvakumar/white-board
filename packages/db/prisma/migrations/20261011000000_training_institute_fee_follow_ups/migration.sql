-- Fee Follow-ups: the Owner's record of chasing an Enrollment's dues (ADR-0039).

-- CreateEnum
CREATE TYPE "training_institute"."fee_follow_up_channel" AS ENUM ('phone', 'whatsapp_sms', 'in_person', 'other');

-- CreateEnum
CREATE TYPE "training_institute"."fee_follow_up_close_reason" AS ENUM ('superseded', 'done', 'dues_cleared');

-- CreateTable
CREATE TABLE "training_institute"."fee_follow_ups" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "channel" "training_institute"."fee_follow_up_channel" NOT NULL,
    "note" VARCHAR(500),
    "next_follow_up_on" DATE,
    "logged_by_user_id" TEXT NOT NULL,
    "edited_by_user_id" TEXT,
    "edited_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "close_reason" "training_institute"."fee_follow_up_close_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_follow_ups_enrollment_id_created_at_idx" ON "training_institute"."fee_follow_ups"("enrollment_id", "created_at");

-- CreateIndex
CREATE INDEX "fee_follow_ups_workspace_id_closed_at_next_follow_up_on_idx" ON "training_institute"."fee_follow_ups"("workspace_id", "closed_at", "next_follow_up_on");

-- AddForeignKey
ALTER TABLE "training_institute"."fee_follow_ups" ADD CONSTRAINT "fee_follow_ups_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "training_institute"."enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one open Fee Follow-up per Enrollment: logging a new one closes the last.
CREATE UNIQUE INDEX "fee_follow_ups_one_open_per_enrollment" ON "training_institute"."fee_follow_ups"("enrollment_id") WHERE "closed_at" IS NULL;

-- A closed Fee Follow-up says why it closed.
ALTER TABLE "training_institute"."fee_follow_ups" ADD CONSTRAINT "fee_follow_ups_close_reason_when_closed" CHECK (("closed_at" IS NULL) = ("close_reason" IS NULL));
