-- Departments go (ADR CM-0048). construction_organization only (ADR-0030).
--
-- Business effect: the Departments menu (`masters.departments`) leaves
-- every Role's Permission Matrix, as Designations did (CM-0033).

DELETE FROM "construction_organization"."role_menu_permissions"
 WHERE "menu" = 'masters.departments';
