-- Staff, Role Management, Labours, Labour Categories and Vendors leave the
-- Master records matrix category for Human Resources (ADR CM-0034). Push
-- is muted per category, so a member who had muted Master records to
-- silence those menus keeps that silence: their mute is copied to the new
-- group once. Written by hand; touches no other schema (ADR-0030).
UPDATE "construction_messaging"."notification_preferences"
SET "muted_groups" = array_append("muted_groups", 'human_resources')
WHERE 'master_records' = ANY("muted_groups")
  AND NOT ('human_resources' = ANY("muted_groups"));
