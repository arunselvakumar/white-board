-- Trial removed at the owner's request (2026-10-09); it will be designed
-- later. A Company now has no subscription row until its first plan is paid.
--
-- A row still marked as a trial never had a paid order applied: every paid
-- order (new, upgrade, extend) cleared the flag, and add-ons could not be
-- bought on a trial. No table references subscriptions (orders link by
-- workspace_id), so deleting these rows loses nothing paid; an open `new`
-- order paid later creates the row again.
--
-- Intended: a Company whose trial had already ended is no longer blocked
-- (no subscription = no limits, no PLAN_EXPIRED) until it buys a plan. The
-- product is not launched, so no paying customer is affected. Each deleted
-- row is first copied to the audit log, so who had a trial and when it
-- ended is not lost.
INSERT INTO "construction_organization"."audit_events" ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), "workspace_id", 'system', 'subscription.removed', 'subscription', "id"::text,
  jsonb_build_object('planCode', "plan_code", 'isTrial', true, 'startsAt', "starts_at", 'endsAt', "ends_at"),
  NULL, now()
FROM "construction_organization"."subscriptions"
WHERE "is_trial" = true;

DELETE FROM "construction_organization"."subscriptions" WHERE "is_trial" = true;

-- AlterTable
ALTER TABLE "construction_organization"."subscriptions" DROP COLUMN "is_trial";
