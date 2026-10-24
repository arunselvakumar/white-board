-- A User whose password a Company admin set must choose their own the first
-- time they sign in (ADR CM-0029). identity only (ADR-0030). Existing Users
-- chose their own passwords, so they all start false.
ALTER TABLE "identity"."users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
