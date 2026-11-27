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
  /** Daily (the default) or monthly. */
  wageType?: "daily" | "monthly";
  /** Paise a day, on a daily wage. Default ₹600. */
  wagePerDay?: number;
  /** Paise a month, on a monthly wage. Default ₹18,000. */
  wagePerMonth?: number;
  /** Decimal hours a day. Default 8. */
  workingHoursPerDay?: string;
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
  photoKey?: string | null;
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
      wageType: input.wageType ?? "daily",
      wagePerDay:
        (input.wageType ?? "daily") === "daily"
          ? (input.wagePerDay ?? 60_000)
          : null,
      wagePerMonth:
        input.wageType === "monthly" ? (input.wagePerMonth ?? 1_800_000) : null,
      workingHoursPerDay: input.workingHoursPerDay ?? "8",
      photoKey: input.photoKey ?? null,
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

/**
 * Moves an Employee between Projects from `date`, as a transfer does
 * (CM-206): off `fromProjectId` (when given), onto `toProjectId` (when
 * given), with the history row.
 */
export async function moveEmployee(input: {
  workspaceId: string;
  employeeId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  date: string;
  by?: string;
}): Promise<void> {
  const transferDate = new Date(`${input.date}T00:00:00Z`);
  if (input.fromProjectId != null)
    await prisma.constructionLabourEmployeeProject.deleteMany({
      where: { employeeId: input.employeeId, projectId: input.fromProjectId },
    });
  if (input.toProjectId != null)
    await prisma.constructionLabourEmployeeProject.create({
      data: {
        workspaceId: input.workspaceId,
        employeeId: input.employeeId,
        projectId: input.toProjectId,
        since: transferDate,
      },
    });
  await prisma.constructionLabourEmployeeTransfer.create({
    data: {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      employeeId: input.employeeId,
      fromProjectId: input.fromProjectId,
      toProjectId: input.toProjectId,
      transferDate,
      createdBy: input.by ?? "test",
    },
  });
  await prisma.constructionLabourEmployee.update({
    where: { id: input.employeeId },
    data: { updatedAt: new Date() },
  });
}
