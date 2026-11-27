import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import {
  isPrismaError,
  isUniqueViolation,
} from "@/src/shared-kernel/prisma-errors";
import type { PrivateDataCipher } from "@/src/shared-kernel/private-data";

import {
  employeeChanged,
  employeeCodeTaken,
  employeeNotFound,
  reportsToLoop,
  reportsToNotFound,
} from "../application/employee-handlers";
import type {
  EmployeeMove,
  EmployeeProjectChange,
  EmployeeRepository,
  EmployeeTransferRecord,
  NewEmployee,
} from "../application/employee-ports";
import {
  Employee,
  last4,
  type BloodGroup,
  type ProjectChanges,
} from "../domain/employee";
import { workingHours, type Weekday } from "../domain/wages";
import { lockLiveParties } from "./party-locks";
import { companyToday } from "./prisma-labour-queries";
import { prismaLedger } from "./prisma-ledger";

type Tx = Prisma.TransactionClient;

/** The Employee's Projects, oldest first (ADR CM-0033). */
const WITH_PROJECTS = {
  projects: {
    select: { projectId: true },
    orderBy: [{ since: "asc" }, { projectId: "asc" }],
  },
} as const satisfies Prisma.ConstructionLabourEmployeeInclude;

export type EmployeeRow = Prisma.ConstructionLabourEmployeeGetPayload<{
  include: typeof WITH_PROJECTS;
}>;

/** An Employee row as the aggregate; Aadhaar, PAN and bank account decrypted. */
export function employeeFromRow(
  row: EmployeeRow,
  cipher: () => PrivateDataCipher,
): Employee {
  const open = (sealed: string | null) =>
    sealed == null ? null : cipher().decrypt(sealed);
  return Employee.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    details: {
      name: row.name,
      employeeCode: row.employeeCode,
      roleId: row.roleId,
      fatherName: row.fatherName,
      dateOfBirth:
        row.dateOfBirth == null ? null : calendarDateFromDb(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup as BloodGroup | null,
      joiningDate: calendarDateFromDb(row.joiningDate),
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      emergencyContact: row.emergencyContact,
      qualification: row.qualification,
      experienceYears: row.experienceYears,
      specialisation: row.specialisation,
      wageType: row.wageType,
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
      workingHoursPerDay: workingHours(row.workingHoursPerDay.toString()),
      weeklyHolidays: row.weeklyHolidays as Weekday[],
      uanNumber: row.uanNumber,
      esicNumber: row.esicNumber,
      aadhaar: open(row.aadhaarEncrypted),
      pan: open(row.panEncrypted),
      bankAccountHolder: row.bankAccountHolder,
      bankAccountNumber: open(row.bankAccountEncrypted),
      bankIfsc: row.bankIfsc,
      bankName: row.bankName,
      labourCategoryId: row.labourCategoryId,
      reportsToId: row.reportsToId,
    },
    projectIds: row.projects.map((project) => project.projectId),
    teamMemberId: row.teamMemberId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function isCodeClash(error: unknown): boolean {
  return (
    isUniqueViolation(error) ||
    // A partial unique index surfaces as a raw unique violation.
    (isPrismaError(error, "P2010") && error.message.includes("23505"))
  );
}

function openingEntry(employee: Employee, amount: number) {
  return {
    partyType: "employee" as const,
    partyId: employee.id,
    projectId: null,
    entryDate: employee.details.joiningDate,
    kind: "opening" as const,
    amount,
    sourceType: "employee" as const,
    sourceId: employee.id,
    reversesEntryId: null,
  };
}

/**
 * Reports To inside the write (ADR CM-0035). The handler checks the choice
 * first; this repeats it under locks so two edits at once cannot make a
 * loop (A → B and B → A) and a delete cannot slip in between: one advisory
 * lock per Company serialises Reports To writes, and the chosen Employee's
 * row is held FOR SHARE, which a delete's FOR UPDATE waits on.
 */
async function guardReportsTo(tx: Tx, employees: readonly Employee[]) {
  const chosen = employees.filter(
    (employee) => employee.details.reportsToId != null,
  );
  const [first] = chosen;
  if (first == null) return;
  const workspaceId = first.workspaceId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`construction_labour.reports_to:${workspaceId}`}, 0))`;
  try {
    await lockLiveParties(
      tx,
      workspaceId,
      "employee",
      chosen.map((employee) => employee.details.reportsToId ?? ""),
      "share",
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "EMPLOYEE_NOT_FOUND")
      throw reportsToNotFound();
    throw error;
  }
  for (const employee of chosen) {
    // Walk up from the chosen Employee; reaching this one is a loop.
    const [found] = await tx.$queryRaw<{ loops: boolean }[]>`
      WITH RECURSIVE chain(id, depth) AS (
        SELECT reports_to_id, 1 FROM construction_labour.employees
         WHERE id = ${employee.details.reportsToId}::uuid
        UNION
        SELECT l.reports_to_id, c.depth + 1
          FROM construction_labour.employees l
          JOIN chain c ON l.id = c.id
         WHERE c.depth < 1000
      )
      SELECT EXISTS (SELECT 1 FROM chain WHERE id = ${employee.id}::uuid) AS loops`;
    if (found?.loops === true) throw reportsToLoop();
  }
}

/** Whether any live attendance or wage payment exists for the Employee. */
async function hasRecords(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const [attendance, payments] = await Promise.all([
    tx.constructionLabourAttendance.count({
      where: { workspaceId, employeeId: id, deletedAt: null },
    }),
    tx.constructionLabourWagePayment.count({
      where: {
        workspaceId,
        partyType: "employee",
        partyId: id,
        deletedAt: null,
      },
    }),
  ]);
  return attendance + payments > 0;
}

/** The Employee record's writes, each in one transaction (ADR CM-0004). */
export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly cipher: () => PrivateDataCipher,
  ) {}

  /** The columns the aggregate owns; Aadhaar, PAN and bank account sealed. */
  private columns(employee: Employee) {
    const details = employee.details;
    const seal = (plain: string | null) =>
      plain == null ? null : this.cipher().encrypt(plain);
    return {
      name: details.name,
      employeeCode: details.employeeCode,
      roleId: details.roleId,
      teamMemberId: employee.teamMemberId,
      fatherName: details.fatherName,
      dateOfBirth:
        details.dateOfBirth == null
          ? null
          : calendarDateToDb(details.dateOfBirth),
      gender: details.gender,
      bloodGroup: details.bloodGroup,
      joiningDate: calendarDateToDb(details.joiningDate),
      mobile: details.mobile,
      email: details.email,
      address: details.address,
      emergencyContact: details.emergencyContact,
      qualification: details.qualification,
      experienceYears: details.experienceYears,
      specialisation: details.specialisation,
      wageType: details.wageType,
      wagePerDay: details.wagePerDay,
      wagePerMonth: details.wagePerMonth,
      overtimeWagePerHour: details.overtimeWagePerHour,
      workingHoursPerDay: details.workingHoursPerDay,
      weeklyHolidays: details.weeklyHolidays,
      uanNumber: details.uanNumber,
      esicNumber: details.esicNumber,
      aadhaarEncrypted: seal(details.aadhaar),
      aadhaarLast4: last4(details.aadhaar),
      panEncrypted: seal(details.pan),
      panLast4: last4(details.pan),
      bankAccountHolder: details.bankAccountHolder,
      bankAccountEncrypted: seal(details.bankAccountNumber),
      bankAccountLast4: last4(details.bankAccountNumber),
      bankIfsc: details.bankIfsc,
      bankName: details.bankName,
      labourCategoryId: details.labourCategoryId,
      reportsToId: details.reportsToId,
      isActive: employee.isActive,
      updatedAt: employee.updatedAt,
      updatedBy: employee.updatedBy,
    };
  }

  async findById(workspaceId: string, id: string): Promise<Employee | null> {
    const row = await this.db.constructionLabourEmployee.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: WITH_PROJECTS,
    });
    return row == null ? null : employeeFromRow(row, this.cipher);
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Employee[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourEmployee.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      include: WITH_PROJECTS,
    });
    return rows.map((row) => employeeFromRow(row, this.cipher));
  }

  async codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>> {
    const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];
    if (lowered.length === 0) return new Set();
    const rows = await this.db.$queryRaw<{ code: string }[]>`
      SELECT lower(employee_code) AS code
      FROM construction_labour.employees
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND lower(employee_code) = ANY(${lowered})
        AND id::text <> ${exceptId ?? ""}
    `;
    return new Set(rows.map((row) => row.code));
  }

  async openingBalance(workspaceId: string, id: string): Promise<number> {
    const sums = await prismaLedger.openingBalances(
      this.db,
      workspaceId,
      "employee",
      [id],
    );
    return sums.get(id) ?? 0;
  }

  async insert(
    items: readonly NewEmployee[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          await guardReportsTo(
            tx,
            items.map(({ employee }) => employee),
          );
          await tx.constructionLabourEmployee.createMany({
            data: items.map(({ employee }) => ({
              id: employee.id,
              workspaceId: employee.workspaceId,
              createdAt: employee.createdAt,
              createdBy: employee.createdBy,
              ...this.columns(employee),
            })),
          });
          // On each Project from the joining date, with its first history row.
          const joined = items.flatMap(({ employee }) =>
            employee.projectIds.map((projectId) => ({ employee, projectId })),
          );
          await tx.constructionLabourEmployeeProject.createMany({
            data: joined.map(({ employee, projectId }) => ({
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              projectId,
              since: calendarDateToDb(employee.details.joiningDate),
            })),
          });
          await tx.constructionLabourEmployeeTransfer.createMany({
            data: joined.map(({ employee, projectId }) => ({
              id: newId(),
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              fromProjectId: null,
              toProjectId: projectId,
              transferDate: calendarDateToDb(employee.details.joiningDate),
              createdAt: employee.createdAt,
              createdBy: employee.createdBy,
            })),
          });
          const [first] = items;
          if (first != null)
            await prismaLedger.post(
              tx,
              first.employee.workspaceId,
              first.employee.createdBy,
              items.map(({ employee, openingBalance }) =>
                openingEntry(employee, openingBalance),
              ),
            );
          for (const audit of audits) await recordAudit(tx, audit);
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      if (isCodeClash(error)) throw employeeCodeTaken();
      throw error;
    }
  }

  async update(input: {
    employee: Employee;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    projects?: (ProjectChanges & { date: CalendarDate }) | null;
    audit: AuditEvent;
  }): Promise<void> {
    const { employee, projects } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await guardReportsTo(tx, [employee]);
        const joinedOn = input.joiningDateChanged
          ? ((
              await tx.constructionLabourEmployee.findUnique({
                where: { id: employee.id },
                select: { joiningDate: true },
              })
            )?.joiningDate ?? null)
          : null;
        const written = await tx.constructionLabourEmployee.updateMany({
          where: {
            id: employee.id,
            workspaceId: employee.workspaceId,
            deletedAt: null,
            ...(input.expectedUpdatedAt == null
              ? {}
              : { updatedAt: input.expectedUpdatedAt }),
          },
          data: this.columns(employee),
        });
        if (written.count === 0) {
          if (input.expectedUpdatedAt == null) throw employeeNotFound();
          throw employeeChanged();
        }
        if (joinedOn != null) {
          // The rows written with the Employee, onto a Project on the old
          // joining date, move to the new one, and so do those Projects.
          const initial = await tx.constructionLabourEmployeeTransfer.findMany({
            where: {
              employeeId: employee.id,
              fromProjectId: null,
              transferDate: joinedOn,
            },
            select: { id: true, toProjectId: true },
          });
          const joiningDate = calendarDateToDb(employee.details.joiningDate);
          await tx.constructionLabourEmployeeTransfer.updateMany({
            where: { id: { in: initial.map((row) => row.id) } },
            data: { transferDate: joiningDate },
          });
          await tx.constructionLabourEmployeeProject.updateMany({
            where: {
              employeeId: employee.id,
              since: joinedOn,
              projectId: {
                in: initial.flatMap((row) =>
                  row.toProjectId == null ? [] : [row.toProjectId],
                ),
              },
            },
            data: { since: joiningDate },
          });
        }
        if (projects != null) {
          const date = calendarDateToDb(projects.date);
          await tx.constructionLabourEmployeeProject.deleteMany({
            where: {
              employeeId: employee.id,
              projectId: { in: projects.removed },
            },
          });
          await tx.constructionLabourEmployeeProject.createMany({
            data: projects.added.map((projectId) => ({
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              projectId,
              since: date,
            })),
          });
          await tx.constructionLabourEmployeeTransfer.createMany({
            data: [
              ...projects.removed.map((projectId) => ({
                fromProjectId: projectId,
                toProjectId: null,
              })),
              ...projects.added.map((projectId) => ({
                fromProjectId: null,
                toProjectId: projectId,
              })),
            ].map((move, index) => ({
              // Removals list before additions in the history.
              id: newId(employee.updatedAt.getTime() + index),
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              ...move,
              transferDate: date,
              createdAt: employee.updatedAt,
              createdBy: employee.updatedBy,
            })),
          });
        }
        if (input.opening != null) {
          await prismaLedger.reverseSource(
            tx,
            employee.workspaceId,
            employee.updatedBy,
            "employee",
            employee.id,
          );
          await prismaLedger.post(
            tx,
            employee.workspaceId,
            employee.updatedBy,
            [openingEntry(employee, input.opening)],
          );
        }
        await recordAudit(tx, input.audit);
      });
    } catch (error) {
      if (isCodeClash(error)) throw employeeCodeTaken();
      throw error;
    }
  }

  async delete(
    employee: Employee,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records"> {
    return this.db.$transaction(async (tx) => {
      // FOR UPDATE waits for any attendance or payment being written for
      // this Employee (they hold FOR SHARE), so the check below sees it.
      await lockLiveParties(
        tx,
        employee.workspaceId,
        "employee",
        [employee.id],
        "update",
      );
      if (await hasRecords(tx, employee.workspaceId, employee.id))
        return "has_records";
      await tx.constructionLabourEmployee.update({
        where: { id: employee.id },
        data: {
          deletedAt: employee.deletedAt,
          deletedBy: employee.updatedBy,
          updatedAt: employee.updatedAt,
          updatedBy: employee.updatedBy,
        },
      });
      await prismaLedger.reverseSource(
        tx,
        employee.workspaceId,
        employee.updatedBy,
        "employee",
        employee.id,
      );
      // Whoever reported to them now reports to no one (ADR CM-0035); the
      // audit event names them.
      const reports = await tx.constructionLabourEmployee.findMany({
        where: { workspaceId: employee.workspaceId, reportsToId: employee.id },
        select: { id: true },
      });
      if (reports.length > 0)
        await tx.constructionLabourEmployee.updateMany({
          where: { id: { in: reports.map((report) => report.id) } },
          data: {
            reportsToId: null,
            updatedAt: employee.updatedAt,
            updatedBy: employee.updatedBy,
          },
        });
      await recordAudit(
        tx,
        reports.length === 0
          ? audit
          : {
              ...audit,
              after: { reportsCleared: reports.map((report) => report.id) },
            },
      );
      return "deleted";
    });
  }

  async transfer(
    moves: readonly EmployeeMove[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    await this.db.$transaction(
      async (tx: Tx) => {
        for (const move of moves) {
          const { employee } = move;
          // Compare-and-set: a Employee moved or edited meanwhile is refused.
          const written = await tx.constructionLabourEmployee.updateMany({
            where: {
              id: employee.id,
              workspaceId: employee.workspaceId,
              deletedAt: null,
              updatedAt: move.loadedUpdatedAt,
            },
            data: {
              updatedAt: employee.updatedAt,
              updatedBy: employee.updatedBy,
            },
          });
          if (written.count === 0) throw employeeChanged();
          const left = await tx.constructionLabourEmployeeProject.deleteMany({
            where: { employeeId: employee.id, projectId: move.fromProjectId },
          });
          if (left.count === 0) throw employeeChanged();
          await tx.constructionLabourEmployeeProject.create({
            data: {
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              projectId: move.toProjectId,
              since: calendarDateToDb(move.transferDate),
            },
          });
        }
        await tx.constructionLabourEmployeeTransfer.createMany({
          data: moves.map((move) => ({
            id: newId(),
            workspaceId: move.employee.workspaceId,
            employeeId: move.employee.id,
            fromProjectId: move.fromProjectId,
            toProjectId: move.toProjectId,
            transferDate: calendarDateToDb(move.transferDate),
            remark: move.remark,
            createdAt: move.employee.updatedAt,
            createdBy: move.employee.updatedBy,
          })),
        });
        for (const audit of audits) await recordAudit(tx, audit);
      },
      { timeout: 60_000 },
    );
  }

  async changeProject(change: EmployeeProjectChange): Promise<void> {
    const [first] = change.employees;
    if (first == null) return;
    const date = calendarDateToDb(change.date);
    await this.db.$transaction(
      async (tx: Tx) => {
        for (const { employee, loadedUpdatedAt } of change.employees) {
          const written = await tx.constructionLabourEmployee.updateMany({
            where: {
              id: employee.id,
              workspaceId: employee.workspaceId,
              deletedAt: null,
              updatedAt: loadedUpdatedAt,
            },
            data: {
              updatedAt: employee.updatedAt,
              updatedBy: employee.updatedBy,
            },
          });
          if (written.count === 0) throw employeeChanged();
        }
        const ids = change.employees.map(({ employee }) => employee.id);
        if (change.direction === "join")
          await tx.constructionLabourEmployeeProject.createMany({
            data: ids.map((employeeId) => ({
              workspaceId: first.employee.workspaceId,
              employeeId,
              projectId: change.projectId,
              since: date,
            })),
          });
        else {
          const left = await tx.constructionLabourEmployeeProject.deleteMany({
            where: { employeeId: { in: ids }, projectId: change.projectId },
          });
          if (left.count !== ids.length) throw employeeChanged();
        }
        await tx.constructionLabourEmployeeTransfer.createMany({
          data: change.employees.map(({ employee }) => ({
            id: newId(),
            workspaceId: employee.workspaceId,
            employeeId: employee.id,
            fromProjectId:
              change.direction === "leave" ? change.projectId : null,
            toProjectId: change.direction === "join" ? change.projectId : null,
            transferDate: date,
            remark: change.remark,
            createdAt: employee.updatedAt,
            createdBy: employee.updatedBy,
          })),
        });
        for (const audit of change.audits) await recordAudit(tx, audit);
      },
      { timeout: 60_000 },
    );
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId);
  }

  async latestAttendance(
    workspaceId: string,
    ids: readonly string[],
    projectId: string,
  ): Promise<Map<string, CalendarDate>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourAttendance.groupBy({
      by: ["employeeId"],
      where: {
        workspaceId,
        projectId,
        employeeId: { in: [...ids] },
        deletedAt: null,
      },
      _max: { attendanceDate: true },
    });
    const latest = new Map<string, CalendarDate>();
    for (const row of rows)
      if (row._max.attendanceDate != null)
        latest.set(row.employeeId, calendarDateFromDb(row._max.attendanceDate));
    return latest;
  }

  async earliestAttendance(
    workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null> {
    const row = await this.db.constructionLabourAttendance.findFirst({
      where: { workspaceId, employeeId: id, deletedAt: null },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return row == null ? null : calendarDateFromDb(row.attendanceDate);
  }

  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<EmployeeTransferRecord[]> {
    const rows = await this.db.constructionLabourEmployeeTransfer.findMany({
      where: { workspaceId, employeeId: id },
      orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      fromProjectId: row.fromProjectId,
      toProjectId: row.toProjectId,
      transferDate: calendarDateFromDb(row.transferDate),
      remark: row.remark,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }
}
