-- Trial removed at the owner's request (2026-10-09); it will be designed
-- later. A Company now has no subscription row until its first plan is paid.
--
-- A row still marked as a trial never had a paid order applied: every paid
-- order (new, upgrade, extend) cleared the flag, and add-ons could not be
-- bought on a trial. No table references subscriptions (orders link by
-- workspace_id), so deleting these rows loses nothing paid; an open `new`
-- order paid later creates the row again.
DELETE FROM "construction_organization"."subscriptions" WHERE "is_trial" = true;

-- AlterTable
ALTER TABLE "construction_organization"."subscriptions" DROP COLUMN "is_trial";
