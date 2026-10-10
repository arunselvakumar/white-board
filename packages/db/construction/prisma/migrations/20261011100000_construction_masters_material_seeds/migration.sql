-- Companies created before M5 get the Measurement Units, Material
-- Categories and starter Materials new Companies receive from the
-- CompanyCreated listener (CM-501, `modules/02` "Seed data"; keep in step
-- with apps/construction-management/src/masters/infrastructure/seeds/masters.json,
-- which a unit test checks). Data only, no schema change, construction_masters
-- only. Idempotent: a Company that already has a live row of the same name
-- (any case) keeps its own.

-- Measurement Units.
INSERT INTO "construction_masters"."measurement_units" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('%'),
  ('Bag'),
  ('Box'),
  ('Brass'),
  ('Bundle'),
  ('cft'),
  ('cm'),
  ('CMT'),
  ('cucm'),
  ('cum'),
  ('Dozen'),
  ('Drum'),
  ('Gallon'),
  ('gram'),
  ('Hour'),
  ('inch'),
  ('kg'),
  ('KGL'),
  ('kL'),
  ('km'),
  ('Litre'),
  ('meter'),
  ('mg'),
  ('mL'),
  ('mm'),
  ('MTS'),
  ('No'),
  ('Pack'),
  ('Pieces'),
  ('PRS'),
  ('Quintal'),
  ('Rft'),
  ('ROLL'),
  ('SET'),
  ('sqft'),
  ('sqm'),
  ('sqyd'),
  ('Ton'),
  ('Trip'),
  ('Unit'),
  ('Yard')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_masters"."measurement_units" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );

-- Material Categories (all top-level).
INSERT INTO "construction_masters"."material_categories" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Aluminium Section'),
  ('C P Fittings'),
  ('Children Play Equipment'),
  ('Civil Work Materials'),
  ('Colour & Paints'),
  ('Construction Chemicals'),
  ('Construction Tools'),
  ('Covers Drainage Chamber & Tank'),
  ('Decorative Landscape Items'),
  ('Electric Material'),
  ('Fabrication Material'),
  ('Fire & Safety'),
  ('Glass & Glazing'),
  ('Hardware'),
  ('Plumbing Material'),
  ('Sanitary Ware'),
  ('Steel & Reinforcement'),
  ('Tiles & Flooring'),
  ('Waterproofing'),
  ('Wood & Plywood'),
  ('Doors & Windows'),
  ('Shuttering & Scaffolding')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_masters"."material_categories" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );

-- Starter Materials, on the Company's live unit and category of that name.
INSERT INTO "construction_masters"."materials" ("id", "workspace_id", "name", "uom_id", "category_id", "item_type", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", u."id",
  (SELECT c."id" FROM "construction_masters"."material_categories" c
   WHERE c."workspace_id" = p."workspace_id" AND lower(c."name") = lower(s."category")
     AND c."deleted_at" IS NULL
   LIMIT 1),
  'consumable', 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Cement OPC 53', 'Civil Work Materials', 'Bag')
) AS s ("name", "category", "unit")
JOIN "construction_masters"."measurement_units" u
  ON u."workspace_id" = p."workspace_id" AND lower(u."name") = lower(s."unit")
  AND u."deleted_at" IS NULL
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_masters"."materials" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );
