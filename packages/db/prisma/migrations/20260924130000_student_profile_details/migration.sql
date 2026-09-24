ALTER TABLE "students" ADD COLUMN "profile_details" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "students"
SET "profile_details" = jsonb_build_object(
  'guardians', jsonb_build_array(
    jsonb_build_object(
      'name', COALESCE(NULLIF("guardian_name", ''), 'Guardian'),
      'phone', "guardian_phone",
      'salutation', NULL,
      'relationship', NULL,
      'email', NULL
    )
  )
)
WHERE "guardian_name" IS NOT NULL OR "guardian_phone" IS NOT NULL;
