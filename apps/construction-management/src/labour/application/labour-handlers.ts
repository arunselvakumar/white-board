import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  Labour,
  assertTransferDate,
  labourDetails,
  maskAadhaar,
  openingBalance,
  type LabourDetails,
  type LabourDetailsInput,
} from "../domain/labour";
import type {
  LabourCategoryDirectory,
  ProjectDirectory,
  SupervisorDirectory,
} from "./directories";
import type {
  LabourListFilter,
  LabourListPage,
  LabourMove,
  LabourOption,
  LabourQueries,
  LabourReadModel,
  LabourRepository,
  LabourTransferRecord,
} from "./labour-ports";

export type CreateLabourInput = LabourDetailsInput & {
  currentProjectId: string;
  /** Paise, signed; 0 when absent. */
  openingBalance?: number | null;
};

/**
 * An edit of the register entry. Money fields and Aadhaar left `undefined`
 * keep their stored values (a Team Member without Financial never sees
 * them); `null` Aadhaar removes it.
 */
export type UpdateLabourInput = Omit<
  LabourDetailsInput,
  "wagePerDay" | "wagePerMonth" | "overtimeWagePerHour"
> & {
  wagePerDay?: number | null;
  wagePerMonth?: number | null;
  overtimeWagePerHour?: number | null;
  openingBalance?: number | null;
  expectedUpdatedAt: Date;
};

export type LabourDirectories = {
  projects: ProjectDirectory;
  labourCategories: LabourCategoryDirectory;
  supervisors: SupervisorDirectory;
};

export const labourNotFound = () =>
  notFound("LABOUR_NOT_FOUND", "This Labour was not found.");

/** What the audit log keeps of a labourer: never the Aadhaar number. */
export function labourSnapshot(labour: Labour) {
  const { aadhaar, ...details } = labour.details;
  return {
    ...details,
    aadhaarMasked: maskAadhaar(aadhaar),
    currentProjectId: labour.currentProjectId,
    isActive: labour.isActive,
  };
}

function withField(error: DomainError, field: string): DomainError {
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { field },
  });
}

/**
 * The Labour register (CM-205, CM-206): commands write through the
 * repository, reads come from the queries. Access is checked by the caller,
 * except the per-source-Project transfer check.
 */
export class LabourHandlers {
  constructor(
    private readonly labours: LabourRepository,
    private readonly queries: LabourQueries,
    private readonly directories: LabourDirectories,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Labour> {
    const found = await this.labours.findById(workspaceId, id);
    if (found == null) throw labourNotFound();
    return found;
  }

  private async view(
    workspaceId: string,
    id: string,
  ): Promise<LabourReadModel> {
    const found = await this.queries.get(workspaceId, id);
    if (found == null) throw labourNotFound();
    return found;
  }

  private audit(
    labour: Labour,
    by: string,
    action: string,
    extra: Partial<AuditEvent> = {},
  ): AuditEvent {
    return {
      workspaceId: labour.workspaceId,
      actorUserId: by,
      action,
      entityType: "labour",
      entityId: labour.id,
      occurredAt: this.clock(),
      ...extra,
    };
  }

  /** Projects must be live; categories and supervisors live and enabled when newly chosen. */
  async assertReferences(
    workspaceId: string,
    refs: {
      projectId?: string;
      labourCategoryId: string | null;
      supervisorId: string | null;
    },
    previous?: Pick<LabourDetails, "labourCategoryId" | "supervisorId">,
  ): Promise<void> {
    if (refs.projectId != null) {
      const projects = await this.directories.projects.find(workspaceId, [
        refs.projectId,
      ]);
      if (!projects.has(refs.projectId))
        throw withField(
          notFound("PROJECT_NOT_FOUND", "This Project was not found."),
          "currentProjectId",
        );
    }
    if (
      refs.labourCategoryId != null &&
      refs.labourCategoryId !== previous?.labourCategoryId
    ) {
      const found = (
        await this.directories.labourCategories.find(workspaceId, [
          refs.labourCategoryId,
        ])
      ).get(refs.labourCategoryId);
      if (found == null || found.disabled)
        throw withField(
          notFound(
            "LABOUR_CATEGORY_NOT_FOUND",
            "This Labour Category was not found or is disabled.",
          ),
          "labourCategoryId",
        );
    }
    if (
      refs.supervisorId != null &&
      refs.supervisorId !== previous?.supervisorId
    ) {
      const found = (
        await this.directories.supervisors.find(workspaceId, [
          refs.supervisorId,
        ])
      ).get(refs.supervisorId);
      if (found == null || found.disabled)
        throw withField(
          notFound(
            "SUPERVISOR_NOT_FOUND",
            "This Supervisor was not found or is disabled.",
          ),
          "supervisorId",
        );
    }
  }

  private async assertCodeFree(
    workspaceId: string,
    code: string | null,
    exceptId?: string,
  ): Promise<void> {
    if (code == null) return;
    const taken = await this.labours.codesTaken(workspaceId, [code], exceptId);
    if (taken.size > 0) throw labourCodeTaken();
  }

  get(workspaceId: string, id: string): Promise<LabourReadModel> {
    return this.view(workspaceId, id);
  }

  list(
    filter: LabourListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<LabourListPage> {
    return this.queries.list(filter);
  }

  all(filter: LabourListFilter): Promise<LabourReadModel[]> {
    return this.queries.all(filter);
  }

  options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<LabourOption[]> {
    return this.queries.options(
      workspaceId,
      projectId,
      assertCalendarDate(date),
    );
  }

  async create(input: {
    workspaceId: string;
    labour: CreateLabourInput;
    by: string;
  }): Promise<LabourReadModel> {
    const details = labourDetails(input.labour);
    const opening = openingBalance(input.labour.openingBalance);
    await this.assertReferences(input.workspaceId, {
      projectId: input.labour.currentProjectId,
      labourCategoryId: details.labourCategoryId,
      supervisorId: details.supervisorId,
    });
    await this.assertCodeFree(input.workspaceId, details.labourCode);
    const now = this.clock();
    const labour = Labour.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      projectId: input.labour.currentProjectId,
      by: input.by,
      now,
    });
    await this.labours.insert(
      [{ labour, openingBalance: opening }],
      [
        this.audit(labour, input.by, "labour.created", {
          after: { ...labourSnapshot(labour), openingBalance: opening },
        }),
      ],
    );
    return this.view(input.workspaceId, labour.id);
  }

  async update(input: {
    workspaceId: string;
    id: string;
    labour: UpdateLabourInput;
    by: string;
  }): Promise<LabourReadModel> {
    const labour = await this.load(input.workspaceId, input.id);
    const before = labourSnapshot(labour);
    const current = labour.details;
    const patch = input.labour;
    const details = labourDetails({
      ...patch,
      wagePerDay:
        patch.wagePerDay === undefined ? current.wagePerDay : patch.wagePerDay,
      wagePerMonth:
        patch.wagePerMonth === undefined
          ? current.wagePerMonth
          : patch.wagePerMonth,
      overtimeWagePerHour:
        patch.overtimeWagePerHour === undefined
          ? current.overtimeWagePerHour
          : patch.overtimeWagePerHour,
      aadhaar: patch.aadhaar === undefined ? current.aadhaar : patch.aadhaar,
    });
    await this.assertReferences(
      input.workspaceId,
      {
        labourCategoryId: details.labourCategoryId,
        supervisorId: details.supervisorId,
      },
      current,
    );
    if (
      details.labourCode != null &&
      details.labourCode.toLowerCase() !== current.labourCode?.toLowerCase()
    )
      await this.assertCodeFree(
        input.workspaceId,
        details.labourCode,
        labour.id,
      );

    const joiningDateChanged = details.joiningDate !== current.joiningDate;
    if (joiningDateChanged)
      await this.assertJoiningDate(labour, details.joiningDate);

    const stored = await this.labours.openingBalance(
      input.workspaceId,
      labour.id,
    );
    const wanted =
      patch.openingBalance === undefined
        ? stored
        : openingBalance(patch.openingBalance);
    const repost = wanted !== stored || (joiningDateChanged && stored !== 0);

    labour.update(details, input.by, this.clock());
    await this.labours.update({
      labour,
      expectedUpdatedAt: patch.expectedUpdatedAt,
      opening: repost ? wanted : null,
      joiningDateChanged,
      audit: this.audit(labour, input.by, "labour.updated", {
        before: { ...before, openingBalance: stored },
        after: { ...labourSnapshot(labour), openingBalance: wanted },
      }),
    });
    return this.view(input.workspaceId, labour.id);
  }

  /** A joining date may not pass the first real transfer or the first attendance day. */
  private async assertJoiningDate(
    labour: Labour,
    joiningDate: CalendarDate,
  ): Promise<void> {
    const history = await this.labours.transfers(labour.workspaceId, labour.id);
    const firstMove = history.find((row) => row.fromProjectId != null);
    if (firstMove != null && joiningDate > firstMove.transferDate)
      throw new DomainError(
        "JOINING_DATE_AFTER_TRANSFER",
        `The joining date must be on or before the first transfer (${firstMove.transferDate}).`,
        { kind: "conflict", details: { field: "joiningDate" } },
      );
    const firstDay = await this.labours.earliestAttendance(
      labour.workspaceId,
      labour.id,
    );
    if (firstDay != null && joiningDate > firstDay)
      throw new DomainError(
        "JOINING_DATE_AFTER_ATTENDANCE",
        `The joining date must be on or before the first attendance day (${firstDay}).`,
        { kind: "conflict", details: { field: "joiningDate" } },
      );
  }

  async setActive(input: {
    workspaceId: string;
    id: string;
    active: boolean;
    by: string;
  }): Promise<LabourReadModel> {
    const labour = await this.load(input.workspaceId, input.id);
    if (labour.isActive !== input.active) {
      const now = this.clock();
      if (input.active) labour.activate(input.by, now);
      else labour.deactivate(input.by, now);
      await this.labours.update({
        labour,
        expectedUpdatedAt: null,
        opening: null,
        joiningDateChanged: false,
        audit: this.audit(
          labour,
          input.by,
          input.active ? "labour.activated" : "labour.deactivated",
          {
            before: { isActive: !input.active },
            after: { isActive: input.active },
          },
        ),
      });
    }
    return this.view(input.workspaceId, labour.id);
  }

  /**
   * Hide = delete (`modules/08` decisions): a tombstone, refused while any
   * attendance or wage payment exists. The opening entry is reversed.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const labour = await this.load(input.workspaceId, input.id);
    if (await this.labours.hasRecords(input.workspaceId, labour.id))
      throw conflict(
        "LABOUR_HAS_RECORDS",
        `${labour.details.name} has attendance or payments. Mark them Inactive instead.`,
      );
    const before = labourSnapshot(labour);
    labour.delete(input.by, this.clock());
    await this.labours.delete(
      labour,
      this.audit(labour, input.by, "labour.deleted", { before }),
    );
  }

  /**
   * Moves one or more labourers to `toProjectId` from `transferDate`
   * (CM-206). All or none: any refusal stops the whole command. The caller
   * checks `transfer` on the destination; this checks each source Project.
   */
  async transfer(input: {
    workspaceId: string;
    access: MemberAccess;
    labourIds: readonly string[];
    toProjectId: string;
    transferDate: string;
    remark?: string | null;
    by: string;
  }): Promise<LabourReadModel[]> {
    const ids = [...new Set(input.labourIds)];
    if (ids.length === 0)
      throw new DomainError("LABOURS_REQUIRED", "Choose at least one Labour.");
    if (ids.length > 500)
      throw new DomainError(
        "TOO_MANY_LABOURS",
        "Transfer at most 500 Labours at a time.",
      );
    const transferDate = assertCalendarDate(
      input.transferDate.trim(),
      "TRANSFER_DATE_INVALID",
    );
    const remark = input.remark?.trim() ?? "";
    if (remark.length > 500)
      throw new DomainError(
        "REMARK_TOO_LONG",
        "The remark must be at most 500 characters.",
      );
    await this.assertReferences(input.workspaceId, {
      projectId: input.toProjectId,
      labourCategoryId: null,
      supervisorId: null,
    });
    const labours = await this.labours.findMany(input.workspaceId, ids);
    if (labours.length !== ids.length) throw labourNotFound();
    for (const labour of labours)
      assertCan(input.access, "labour.labour", "transfer", {
        projectId: labour.currentProjectId,
      });

    const history = new Map<string, CalendarDate>();
    await Promise.all(
      labours.map(async (labour) => {
        const rows = await this.labours.transfers(input.workspaceId, labour.id);
        const last = rows.at(-1);
        if (last != null) history.set(labour.id, last.transferDate);
      }),
    );
    const attendance = await this.labours.latestAttendance(
      input.workspaceId,
      ids,
    );
    const now = this.clock();
    const moves: LabourMove[] = [];
    const audits: AuditEvent[] = [];
    for (const labour of labours) {
      assertTransferDate({
        name: labour.details.name,
        transferDate,
        lastTransferDate: history.get(labour.id) ?? null,
        latestAttendanceDate: attendance.get(labour.id) ?? null,
      });
      const loadedUpdatedAt = labour.updatedAt;
      const fromProjectId = labour.transferTo(input.toProjectId, input.by, now);
      moves.push({
        labour,
        fromProjectId,
        loadedUpdatedAt,
        transferDate,
        remark: remark.length === 0 ? null : remark,
      });
      audits.push(
        this.audit(labour, input.by, "labour.transferred", {
          before: { currentProjectId: fromProjectId },
          after: {
            currentProjectId: input.toProjectId,
            transferDate,
            remark: remark.length === 0 ? null : remark,
          },
        }),
      );
    }
    await this.labours.transfer(moves, audits);
    return Promise.all(ids.map((id) => this.view(input.workspaceId, id)));
  }

  /** The labourer's history, oldest first, with Project names. */
  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<
    (LabourTransferRecord & {
      fromProject: { id: string; name: string } | null;
      toProject: { id: string; name: string };
    })[]
  > {
    await this.load(workspaceId, id);
    const rows = await this.labours.transfers(workspaceId, id);
    const names = await this.directories.projects.find(
      workspaceId,
      rows.flatMap((row) =>
        row.fromProjectId == null
          ? [row.toProjectId]
          : [row.fromProjectId, row.toProjectId],
      ),
    );
    const project = (projectId: string) =>
      names.get(projectId) ?? { id: projectId, name: "Deleted Project" };
    return rows.map((row) => ({
      ...row,
      fromProject:
        row.fromProjectId == null ? null : project(row.fromProjectId),
      toProject: project(row.toProjectId),
    }));
  }
}

export function labourCodeTaken(): DomainError {
  return new DomainError(
    "LABOUR_CODE_TAKEN",
    "Another Labour has this Labour Id.",
    { kind: "conflict", details: { field: "labourCode" } },
  );
}
