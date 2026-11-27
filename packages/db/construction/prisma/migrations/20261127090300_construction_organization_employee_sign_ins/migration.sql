-- An Employee's sign-in replaces a Site Engineer's (ADR CM-0055).
--
-- Business effect: `team_members.site_engineer` marked the sign-in of a
-- Site Engineer, kept off Office Staff. Site Engineers are gone (previous
-- migration), so their sign-ins show on Office Staff from now on, as
-- ordinary members on the Role they had (Site Engineer as seeded); an
-- admin can delete them there. `employee` marks the sign-in of an Employee
-- in the same way; none exists yet.
--
-- Schemas: changes construction_organization only (ADR-0030).

-- 1. Keep a record of who moves to Office Staff.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), m."workspace_id", 'system', 'team_member.site_engineer_sign_in_to_office_staff', 'team_member', m."id"::text,
       jsonb_build_object('siteEngineer', true),
       jsonb_build_object('siteEngineer', false),
       now()
  FROM "construction_organization"."team_members" m
 WHERE m."site_engineer" AND m."deleted_at" IS NULL;

-- 2. The flag.
ALTER TABLE "construction_organization"."team_members" DROP COLUMN "site_engineer",
ADD COLUMN "employee" BOOLEAN NOT NULL DEFAULT false;
