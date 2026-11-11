-- The sign-in of a Site Engineer (ADR CM-0037): a Team Member made and
-- managed from the Site Engineer page. Office Staff leaves these out.
-- Existing Team Members are not Site Engineers' sign-ins (false).
-- Touches no other schema (ADR-0030).

-- AlterTable
ALTER TABLE "construction_organization"."team_members" ADD COLUMN     "site_engineer" BOOLEAN NOT NULL DEFAULT false;
