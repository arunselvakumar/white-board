-- Companies created before M4 get the Amenities and Common Developments
-- new Companies receive from the CompanyCreated listener (CM-404, ADR
-- CM-0013 §5; keep in step with
-- apps/construction-management/src/masters/domain/development-seeds.ts).
-- Data only, no schema change. Idempotent: a Company that already has a
-- live row of the same kind and name (any case) keeps its own.
INSERT INTO "construction_masters"."development_types" ("id", "workspace_id", "kind", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."kind"::"construction_masters"."development_kind", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('amenity', 'Swimming Pool'),
  ('amenity', 'Club House'),
  ('amenity', 'Gymnasium'),
  ('amenity', 'Children''s Play Area'),
  ('amenity', 'Landscaped Garden'),
  ('amenity', 'Jogging Track'),
  ('amenity', 'Indoor Games Room'),
  ('amenity', 'Multipurpose Hall'),
  ('common_development', 'Compound Wall'),
  ('common_development', 'Internal Roads'),
  ('common_development', 'Main Gate & Security Cabin'),
  ('common_development', 'Overhead Water Tank'),
  ('common_development', 'Underground Sump'),
  ('common_development', 'Sewage Treatment Plant'),
  ('common_development', 'Storm Water Drain'),
  ('common_development', 'Rain Water Harvesting'),
  ('common_development', 'Street Lights'),
  ('common_development', 'Electrical Substation')
) AS s ("kind", "name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_masters"."development_types" t
    WHERE t."workspace_id" = p."workspace_id"
      AND t."kind"::text = s."kind"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );
