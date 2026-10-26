-- Designations go (ADR CM-0033). construction_organization only (ADR-0030):
-- no other schema has a table, foreign key or view on `designations` or
-- `team_members.designation_id` (HRMS, Sales, Reporting and the backups
-- read the name through application code, which this change removes).
--
-- Business effect: since ADR CM-0030 access comes from Roles, so a
-- Designation was only a job title the Owner had to pick before saving a
-- Staff member. From now on Staff have no job title:
--
--   1. Each Staff member's Designation name and each Back-dated Entry
--      policy's override lists are kept as audit events, so the history
--      still says who was what.
--   2. Back-dated Entry overrides become Roles. A Designation does not map
--      one-to-one to a Role, so every override list is cleared and the
--      Owner picks Roles again. Day limits and the Financial Closing Date
--      are unchanged; until Roles are picked only the Owner passes a limit.
--   3. The Designations menu (`organization.designations`) leaves every
--      Role's Permission Matrix.
--   4. `team_members.designation_id` and `designations` are dropped.

-- 1. Keep what goes as audit events.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), t."workspace_id", 'system', 'team_member.designation_removed', 'team_member', t."id"::text,
       jsonb_build_object('designationId', t."designation_id", 'designationName', d."name"),
       '{}'::jsonb,
       now()
  FROM "construction_organization"."team_members" t
  LEFT JOIN "construction_organization"."designations" d ON d."id" = t."designation_id";

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), p."workspace_id", 'system', 'backdated_policy.overrides_cleared', 'backdated_policy', p."id"::text,
       jsonb_build_object(
         'createOverrideDesignationIds', to_jsonb(p."create_override_designation_ids"),
         'editOverrideDesignationIds', to_jsonb(p."edit_override_designation_ids"),
         'modules', p."modules"),
       '{}'::jsonb,
       now()
  FROM "construction_organization"."backdated_entry_policies" p;

-- 2. Back-dated Entry overrides are Roles, starting empty.
ALTER TABLE "construction_organization"."backdated_entry_policies"
    DROP COLUMN "create_override_designation_ids",
    DROP COLUMN "edit_override_designation_ids",
    ADD COLUMN "create_override_role_ids" UUID[],
    ADD COLUMN "edit_override_role_ids" UUID[];

UPDATE "construction_organization"."backdated_entry_policies"
   SET "create_override_role_ids" = ARRAY[]::UUID[],
       "edit_override_role_ids" = ARRAY[]::UUID[];

-- Each module's `{ create: { days, overrideDesignationIds }, edit: … }`
-- becomes `{ create: { days, overrideRoleIds: [] }, edit: … }`.
CREATE FUNCTION pg_temp.limit_with_roles(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) = 'object'
      THEN (value - 'overrideDesignationIds') || '{"overrideRoleIds": []}'::jsonb
    ELSE value
  END
$$;

UPDATE "construction_organization"."backdated_entry_policies" p
   SET "modules" = COALESCE((
         SELECT jsonb_object_agg(
                  m.key,
                  CASE
                    WHEN jsonb_typeof(m.value) = 'object'
                      THEN m.value
                        || CASE WHEN m.value ? 'create'
                             THEN jsonb_build_object('create', pg_temp.limit_with_roles(m.value -> 'create'))
                             ELSE '{}'::jsonb END
                        || CASE WHEN m.value ? 'edit'
                             THEN jsonb_build_object('edit', pg_temp.limit_with_roles(m.value -> 'edit'))
                             ELSE '{}'::jsonb END
                    ELSE m.value
                  END)
           FROM jsonb_each(p."modules") m), '{}'::jsonb)
 WHERE jsonb_typeof(p."modules") = 'object';

-- 3. The Designations menu leaves every Role.
DELETE FROM "construction_organization"."role_menu_permissions"
 WHERE "menu" = 'organization.designations';

-- 4. Drop the column and the table.
ALTER TABLE "construction_organization"."team_members" DROP COLUMN "designation_id";

DROP TABLE "construction_organization"."designations";
