import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

// Employees straight into the database (ADR CM-0055), for tests that need
// one to exist rather than to test adding one.

export type SeedEmployee = {
  workspaceId: string;
  name?: string;
  /** A live Role of the Company; defaults to its seeded "Labour" Role. */
  roleId?: string;
  employeeCode?: string | null;
  mobile?: string | null;
  /** Paise a day; the wage type is daily. Default ₹600. */
  wagePerDay?: number;
  /** Paise an hour. Default ₹100. */
  overtimeWagePerHour?: number;
  joiningDate?: string;
  weeklyHolidays?: number[];
  labourCategoryId?: string | null;
  reportsToId?: string | null;
  isActive?: boolean;
  /** Each is joined from `joiningDate`, with its history row. */
  projectIds?: readonly string[];
  teamMemberId?: string | null;
  by?: string;
};

/** The id of a seeded Role, by name, in a Company. */
export async function seededRoleId(
  workspaceId: string,
  name = "Labour",
): Promise<string> {
  const role = await prisma.constructionOrganizationRole.findFirst({
    where: { workspaceId, name, deletedAt: null },
    select: { id: true },
  });
  if (role == null) throw new Error(`No Role ${name} in ${workspaceId}`);
  return role.id;
}

/** Inserts a live Employee (and their Projects); returns its id. */
export async function seedEmployee(input: SeedEmployee): Promise<string> {
  const id = randomUUID();
  const by = input.by ?? "test";
  const joiningDate = new Date(
    `${input.joiningDate ?? "2026-01-01"}T00:00:00Z`,
  );
  const roleId = input.roleId ?? (await seededRoleId(input.workspaceId));
  await prisma.constructionLabourEmployee.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      name: input.name ?? `Employee ${id.slice(0, 6)}`,
      employeeCode: input.employeeCode ?? null,
      roleId,
      teamMemberId: input.teamMemberId ?? null,
      mobile: input.mobile ?? null,
      joiningDate,
      wageType: "daily",
      wagePerDay: input.wagePerDay ?? 60_000,
      overtimeWagePerHour: input.overtimeWagePerHour ?? 10_000,
      weeklyHolidays: input.weeklyHolidays ?? [0],
      labourCategoryId: input.labourCategoryId ?? null,
      reportsToId: input.reportsToId ?? null,
      isActive: input.isActive ?? true,
      createdBy: by,
      updatedBy: by,
    },
  });
  for (const projectId of input.projectIds ?? []) {
    await prisma.constructionLabourEmployeeProject.create({
      data: {
        workspaceId: input.workspaceId,
        employeeId: id,
        projectId,
        since: joiningDate,
      },
    });
    await prisma.constructionLabourEmployeeTransfer.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        employeeId: id,
        fromProjectId: null,
        toProjectId: projectId,
        transferDate: joiningDate,
        createdBy: by,
      },
    });
  }
  return id;
}
