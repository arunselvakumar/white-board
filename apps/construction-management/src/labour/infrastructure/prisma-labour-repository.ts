import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { PrivateDataCipher } from "@/src/shared-kernel/private-data";

import {
  labourCodeTaken,
  labourNotFound,
} from "../application/labour-handlers";
import type {
  LabourMove,
  LabourRepository,
  LabourTransferRecord,
  NewLabour,
} from "../application/labour-ports";
import { Labour } from "../domain/labour";
import { workingHours, type Weekday } from "../domain/wages";
import { lockLiveParties } from "./party-locks";
import { prismaLedger } from "./prisma-ledger";

type Tx = Prisma.TransactionClient;

export type LabourRow = Prisma.ConstructionLabourLabourGetPayload<object>;

/** A labourer row as the aggregate; Aadhaar decrypted. */
export function labourFromRow(
  row: LabourRow,
  cipher: () => PrivateDataCipher,
): Labour {
  return Labour.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    details: {
      name: row.name,
      labourCode: row.labourCode,
      fatherName: row.fatherName,
      joiningDate: calendarDateFromDb(row.joiningDate),
      wageType: row.wageType,
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
      workingHoursPerDay: workingHours(row.workingHoursPerDay.toString()),
      weeklyHolidays: row.weeklyHolidays as Weekday[],
      uanNumber: row.uanNumber,
      esicNumber: row.esicNumber,
      aadhaar:
        row.aadhaarEncrypted == null
          ? null
          : cipher().decrypt(row.aadhaarEncrypted),
      labourCategoryId: row.labourCategoryId,
      supervisorId: row.supervisorId,
      contactNumber: row.contactNumber,
      gender: row.gender,
    },
    currentProjectId: row.currentProjectId,
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
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" ||
      // A partial unique index surfaces as a raw unique violation.
      (error.code === "P2010" && error.message.includes("23505")))
  );
}

function openingEntry(labour: Labour, amount: number) {
  return {
    partyType: "labour" as const,
    partyId: labour.id,
    projectId: null,
    entryDate: labour.details.joiningDate,
    kind: "opening" as const,
    amount,
    sourceType: "labour" as const,
    sourceId: labour.id,
    reversesEntryId: null,
  };
}

/** The labour register's writes, each in one transaction (ADR CM-0004). */
/** Whether any live attendance or wage payment exists for the labourer. */
async function hasRecords(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const [attendance, payments] = await Promise.all([
    tx.constructionLabourAttendance.count({
      where: { workspaceId, labourId: id, deletedAt: null },
    }),
    tx.constructionLabourWagePayment.count({
      where: { workspaceId, partyType: "labour", partyId: id, deletedAt: null },
    }),
  ]);
  return attendance + payments > 0;
}

export class PrismaLabourRepository implements LabourRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly cipher: () => PrivateDataCipher,
  ) {}

  /** The columns the aggregate owns, Aadhaar sealed. */
  private columns(labour: Labour) {
    const details = labour.details;
    return {
      name: details.name,
      labourCode: details.labourCode,
      fatherName: details.fatherName,
      joiningDate: calendarDateToDb(details.joiningDate),
      wageType: details.wageType,
      wagePerDay: details.wagePerDay,
      wagePerMonth: details.wagePerMonth,
      overtimeWagePerHour: details.overtimeWagePerHour,
      workingHoursPerDay: details.workingHoursPerDay,
      weeklyHolidays: details.weeklyHolidays,
      uanNumber: details.uanNumber,
      esicNumber: details.esicNumber,
      aadhaarEncrypted:
        details.aadhaar == null ? null : this.cipher().encrypt(details.aadhaar),
      aadhaarLast4: details.aadhaar?.slice(-4) ?? null,
      labourCategoryId: details.labourCategoryId,
      supervisorId: details.supervisorId,
      contactNumber: details.contactNumber,
      gender: details.gender,
      currentProjectId: labour.currentProjectId,
      isActive: labour.isActive,
      updatedAt: labour.updatedAt,
      updatedBy: labour.updatedBy,
    };
  }

  async findById(workspaceId: string, id: string): Promise<Labour | null> {
    const row = await this.db.constructionLabourLabour.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : labourFromRow(row, this.cipher);
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Labour[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
    });
    return rows.map((row) => labourFromRow(row, this.cipher));
  }

  async codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>> {
    const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];
    if (lowered.length === 0) return new Set();
    const rows = await this.db.$queryRaw<{ code: string }[]>`
      SELECT lower(labour_code) AS code
      FROM construction_labour.labours
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND lower(labour_code) = ANY(${lowered})
        AND id::text <> ${exceptId ?? ""}
    `;
    return new Set(rows.map((row) => row.code));
  }

  async openingBalance(workspaceId: string, id: string): Promise<number> {
    const sums = await prismaLedger.openingBalances(
      this.db,
      workspaceId,
      "labour",
      [id],
    );
    return sums.get(id) ?? 0;
  }

  async insert(
    items: readonly NewLabour[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.constructionLabourLabour.createMany({
            data: items.map(({ labour }) => ({
              id: labour.id,
              workspaceId: labour.workspaceId,
              createdAt: labour.createdAt,
              createdBy: labour.createdBy,
              ...this.columns(labour),
            })),
          });
          // The first history row: on the Project from the joining date.
          await tx.constructionLabourTransfer.createMany({
            data: items.map(({ labour }) => ({
              id: newId(),
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              fromProjectId: null,
              toProjectId: labour.currentProjectId,
              transferDate: calendarDateToDb(labour.details.joiningDate),
              createdAt: labour.createdAt,
              createdBy: labour.createdBy,
            })),
          });
          const [first] = items;
          if (first != null)
            await prismaLedger.post(
              tx,
              first.labour.workspaceId,
              first.labour.createdBy,
              items.map(({ labour, openingBalance }) =>
                openingEntry(labour, openingBalance),
              ),
            );
          for (const audit of audits) await recordAudit(tx, audit);
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      if (isCodeClash(error)) throw labourCodeTaken();
      throw error;
    }
  }

  async update(input: {
    labour: Labour;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    audit: AuditEvent;
  }): Promise<void> {
    const { labour } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const written = await tx.constructionLabourLabour.updateMany({
          where: {
            id: labour.id,
            workspaceId: labour.workspaceId,
            deletedAt: null,
            ...(input.expectedUpdatedAt == null
              ? {}
              : { updatedAt: input.expectedUpdatedAt }),
          },
          data: this.columns(labour),
        });
        if (written.count === 0) {
          if (input.expectedUpdatedAt == null) throw labourNotFound();
          throw labourChanged();
        }
        if (input.joiningDateChanged) {
          const first = await tx.constructionLabourTransfer.findFirst({
            where: { labourId: labour.id, fromProjectId: null },
            orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }],
          });
          if (first != null)
            await tx.constructionLabourTransfer.update({
              where: { id: first.id },
              data: {
                transferDate: calendarDateToDb(labour.details.joiningDate),
              },
            });
        }
        if (input.opening != null) {
          await prismaLedger.reverseSource(
            tx,
            labour.workspaceId,
            labour.updatedBy,
            "labour",
            labour.id,
          );
          await prismaLedger.post(tx, labour.workspaceId, labour.updatedBy, [
            openingEntry(labour, input.opening),
          ]);
        }
        await recordAudit(tx, input.audit);
      });
    } catch (error) {
      if (isCodeClash(error)) throw labourCodeTaken();
      throw error;
    }
  }

  async delete(
    labour: Labour,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records"> {
    return this.db.$transaction(async (tx) => {
      // FOR UPDATE waits for any attendance or payment being written for
      // this labourer (they hold FOR SHARE), so the check below sees it.
      await lockLiveParties(
        tx,
        labour.workspaceId,
        "labour",
        [labour.id],
        "update",
      );
      if (await hasRecords(tx, labour.workspaceId, labour.id))
        return "has_records";
      await tx.constructionLabourLabour.update({
        where: { id: labour.id },
        data: {
          deletedAt: labour.deletedAt,
          deletedBy: labour.updatedBy,
          updatedAt: labour.updatedAt,
          updatedBy: labour.updatedBy,
        },
      });
      await prismaLedger.reverseSource(
        tx,
        labour.workspaceId,
        labour.updatedBy,
        "labour",
        labour.id,
      );
      await recordAudit(tx, audit);
      return "deleted";
    });
  }

  async transfer(
    moves: readonly LabourMove[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    await this.db.$transaction(
      async (tx: Tx) => {
        for (const move of moves) {
          const { labour } = move;
          // Compare-and-set: a labourer moved or edited meanwhile is refused.
          const written = await tx.constructionLabourLabour.updateMany({
            where: {
              id: labour.id,
              workspaceId: labour.workspaceId,
              deletedAt: null,
              currentProjectId: move.fromProjectId,
              updatedAt: move.loadedUpdatedAt,
            },
            data: {
              currentProjectId: labour.currentProjectId,
              updatedAt: labour.updatedAt,
              updatedBy: labour.updatedBy,
            },
          });
          if (written.count === 0) throw labourChanged();
        }
        await tx.constructionLabourTransfer.createMany({
          data: moves.map((move) => ({
            id: newId(),
            workspaceId: move.labour.workspaceId,
            labourId: move.labour.id,
            fromProjectId: move.fromProjectId,
            toProjectId: move.labour.currentProjectId,
            transferDate: calendarDateToDb(move.transferDate),
            remark: move.remark,
            createdAt: move.labour.updatedAt,
            createdBy: move.labour.updatedBy,
          })),
        });
        for (const audit of audits) await recordAudit(tx, audit);
      },
      { timeout: 60_000 },
    );
  }

  async latestAttendance(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CalendarDate>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourAttendance.groupBy({
      by: ["labourId"],
      where: { workspaceId, labourId: { in: [...ids] }, deletedAt: null },
      _max: { attendanceDate: true },
    });
    const latest = new Map<string, CalendarDate>();
    for (const row of rows)
      if (row._max.attendanceDate != null)
        latest.set(row.labourId, calendarDateFromDb(row._max.attendanceDate));
    return latest;
  }

  async earliestAttendance(
    workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null> {
    const row = await this.db.constructionLabourAttendance.findFirst({
      where: { workspaceId, labourId: id, deletedAt: null },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return row == null ? null : calendarDateFromDb(row.attendanceDate);
  }

  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<LabourTransferRecord[]> {
    const rows = await this.db.constructionLabourTransfer.findMany({
      where: { workspaceId, labourId: id },
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

export function labourChanged() {
  return conflict(
    "LABOUR_CHANGED",
    "Someone else changed this Labour after you opened it. Reload to see their changes.",
  );
}
