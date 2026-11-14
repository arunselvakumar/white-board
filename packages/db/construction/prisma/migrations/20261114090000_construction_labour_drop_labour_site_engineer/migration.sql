-- A Labour's Site Engineers come from their Projects (ADR CM-0041), so the
-- Labour's own Site Engineer (`labours.supervisor_id`) goes.
--
-- Business effect: a Labour now answers to the Site Engineers on the
-- Projects they work on (CM-0038 §3). The Site Engineer picked on each
-- Labour is not turned into Project staffing; it is kept as an audit event
-- so the history still says who it was. Attendance days keep the Site
-- Engineer saved with them (`labour_attendance.supervisor_id` stays).
--
-- Schemas: drops a column in construction_labour only (ADR-0030). The
-- record goes to the shared kernel's audit log, which every context writes
-- through `recordAudit`; the names are read from construction_masters. No
-- other schema has a foreign key, view or index on the column.

-- 1. Keep what goes as audit events.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), l."workspace_id", 'system', 'labour.site_engineer_removed', 'labour', l."id"::text,
       jsonb_build_object('supervisorId', l."supervisor_id", 'supervisorName', s."name"),
       '{}'::jsonb,
       now()
  FROM "construction_labour"."labours" l
  LEFT JOIN "construction_masters"."supervisors" s ON s."id" = l."supervisor_id"
 WHERE l."supervisor_id" IS NOT NULL;

-- 2. Drop the column.
ALTER TABLE "construction_labour"."labours" DROP COLUMN "supervisor_id";
