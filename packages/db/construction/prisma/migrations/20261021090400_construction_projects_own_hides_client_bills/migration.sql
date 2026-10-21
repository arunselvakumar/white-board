-- Role module defaults (CM-1101, ADR CM-0023 §22). Touches
-- construction_projects only (ADR-0030).
--
-- Business effect: an Own development Project has no Client to bill, so
-- its Client Bills module starts hidden on the Project home and sidebar,
-- as a new Own development Project does. Contract work Projects keep every
-- Contracts module shown. Hidden modules already on a Project stay; the
-- Owner shows Client Bills again from the Project home if they need it.
-- Running it twice changes nothing.
INSERT INTO "construction_projects"."hidden_modules"
  ("workspace_id", "project_id", "module_key", "hidden_by", "hidden_at")
SELECT p."workspace_id", p."id", 'client_bills', p."created_by", CURRENT_TIMESTAMP
FROM "construction_projects"."projects" p
WHERE p."role" = 'own'
  AND p."deleted_at" IS NULL
ON CONFLICT ("project_id", "module_key") DO NOTHING;
