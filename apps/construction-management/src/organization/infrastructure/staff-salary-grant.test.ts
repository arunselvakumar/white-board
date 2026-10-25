import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { flagBit } from "@/src/shared-kernel/access/flags";

import { seedRoles } from "./role-seeds";

const MIGRATION = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261025090000_construction_organization_team_member_salary/migration.sql",
);

describe("Staff Financial grant migration (ADR CM-0032)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("grants Financial on Staff to the seeded Roles that have it in the seeds", () => {
    const seeded = seedRoles({
      workspaceId: "company-1",
      by: "user-1",
      now: new Date("2026-10-25T00:00:00Z"),
    })
      .filter((role) =>
        role.permissions
          .toGrants()
          ["organization.team_members"]?.includes("financial"),
      )
      .map((role) => role.name);
    const granted = [
      ...(/"name" IN \(([^)]*)\)/.exec(sql)?.[1] ?? "").matchAll(/'([^']+)'/g),
    ].map((match) => match[1]);
    expect(granted).toEqual(seeded);
    expect(granted).toEqual(["Admin"]);
  });

  it("ORs in the Financial bit", () => {
    expect(sql).toContain(`| ${String(flagBit("financial"))}`);
  });
});
