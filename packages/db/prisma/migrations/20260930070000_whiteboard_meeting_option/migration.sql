CREATE TYPE "meeting_option" AS ENUM ('external', 'whiteboard');
ALTER TABLE "batches" ADD COLUMN "meeting_option" "meeting_option" NOT NULL DEFAULT 'external';
