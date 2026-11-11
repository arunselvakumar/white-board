import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";
import type { PrivateDataCipher } from "@/src/shared-kernel/private-data";

import type { MasterChange, SupervisorStore } from "../application/ports";
import { masterChanged, masterNameInUse } from "../domain/master-kind";
import type { BloodGroup } from "../domain/site-engineer-profile";
import { Supervisor } from "../domain/supervisor";

type Row = Prisma.ConstructionMastersSupervisorGetPayload<object>;

function calendarDate(value: Date | null): string | null {
  return value == null ? null : value.toISOString().slice(0, 10);
}

function dateColumn(value: string | null): Date | null {
  return value == null ? null : new Date(`${value}T00:00:00Z`);
}

/** 409 for the live name or Employee Code a unique index refused. */
function inUse(error: unknown): DomainError {
  if (JSON.stringify(error).includes("employee_code"))
    return new DomainError(
      "SUPERVISOR_EMPLOYEE_CODE_IN_USE",
      "Another Site Engineer has this Employee Code.",
      { kind: "conflict" },
    );
  return masterNameInUse("supervisor");
}

function toSupervisor(row: Row, cipher: () => PrivateDataCipher): Supervisor {
  return Supervisor.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    mobile: row.mobile,
    teamMemberId: row.teamMemberId,
    profile: {
      employeeCode: row.employeeCode,
      fatherName: row.fatherName,
      dateOfBirth: calendarDate(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup as BloodGroup | null,
      joiningDate: calendarDate(row.joiningDate),
      qualification: row.qualification,
      experienceYears: row.experienceYears,
      specialisation: row.specialisation,
    },
    bank: {
      accountHolder: row.bankAccountHolder,
      accountNumber:
        row.bankAccountEncrypted == null
          ? null
          : cipher().decrypt(row.bankAccountEncrypted),
      ifsc: row.bankIfsc,
      bankName: row.bankName,
    },
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  });
}

function audit(supervisor: Supervisor, change: MasterChange) {
  return {
    workspaceId: supervisor.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: "supervisor",
    entityId: supervisor.id,
    before: change.before,
    after: supervisor.deletedAt == null ? supervisor.snapshot() : null,
    occurredAt: change.now,
  };
}

/** The profile and bank columns of a write (ADR CM-0037). */
function profileColumns(
  supervisor: Supervisor,
  cipher: () => PrivateDataCipher,
) {
  const { profile, bank } = supervisor;
  return {
    employeeCode: profile.employeeCode,
    fatherName: profile.fatherName,
    dateOfBirth: dateColumn(profile.dateOfBirth),
    gender: profile.gender,
    bloodGroup: profile.bloodGroup,
    joiningDate: dateColumn(profile.joiningDate),
    qualification: profile.qualification,
    experienceYears: profile.experienceYears,
    specialisation: profile.specialisation,
    bankAccountHolder: bank.accountHolder,
    bankAccountEncrypted:
      bank.accountNumber == null ? null : cipher().encrypt(bank.accountNumber),
    bankAccountLast4:
      bank.accountNumber == null ? null : bank.accountNumber.slice(-4),
    bankIfsc: bank.ifsc,
    bankName: bank.bankName,
  };
}

/** Supervisors in `construction_masters.supervisors` (CM-203). */
export class PrismaSupervisorStore implements SupervisorStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly cipher: () => PrivateDataCipher,
  ) {}

  async list(workspaceId: string): Promise<Supervisor[]> {
    const rows = await this.db.constructionMastersSupervisor.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toSupervisor(row, this.cipher));
  }

  async find(workspaceId: string, id: string): Promise<Supervisor | null> {
    const row = await this.db.constructionMastersSupervisor.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toSupervisor(row, this.cipher);
  }

  async insert(supervisor: Supervisor, change: MasterChange): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionMastersSupervisor.create({
          data: {
            id: supervisor.id,
            workspaceId: supervisor.workspaceId,
            name: supervisor.name,
            mobile: supervisor.mobile,
            teamMemberId: supervisor.teamMemberId,
            ...profileColumns(supervisor, this.cipher),
            disabledAt: supervisor.disabledAt,
            createdAt: supervisor.createdAt,
            updatedAt: supervisor.updatedAt,
            createdBy: supervisor.createdBy,
            updatedBy: supervisor.updatedBy,
          },
        });
        await recordAudit(tx, audit(supervisor, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw inUse(error);
      throw error;
    }
  }

  async update(
    supervisor: Supervisor,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await tx.constructionMastersSupervisor.updateMany({
          where: {
            id: supervisor.id,
            workspaceId: supervisor.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: supervisor.name,
            mobile: supervisor.mobile,
            teamMemberId: supervisor.teamMemberId,
            ...profileColumns(supervisor, this.cipher),
            disabledAt: supervisor.disabledAt,
            updatedAt: supervisor.updatedAt,
            updatedBy: supervisor.updatedBy,
            deletedAt: supervisor.deletedAt,
            deletedBy: supervisor.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged("supervisor");
        await recordAudit(tx, audit(supervisor, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw inUse(error);
      throw error;
    }
  }
}
