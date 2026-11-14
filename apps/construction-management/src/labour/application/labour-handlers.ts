import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor, NameCursor } from "@/src/shared-kernel/list-cursor";

import {
  Labour,
  assertTransferDate,
  labourDetails,
  maskAadhaar,
  openingBalance,
  uniqueProjectIds,
  type LabourDetails,
  type LabourDetailsInput,
  type ProjectChanges,
} from "../domain/labour";
import type { LabourCategoryDirectory, ProjectDirectory } from "./directories";
import type {
  LabourListFilter,
  LabourListPage,
  LabourMove,
  LabourOption,
  LabourQueries,
  LabourReadModel,
  LabourRepository,
  LabourTransferRecord,
  ProjectLabourChoice,
  ProjectLabourPage,
} from "./labour-ports";

export type CreateLabourInput = LabourDetailsInput & {
  /** None, one or many (ADR CM-0033); each is on from the joining date. */
  projectIds?: readonly string[];
  /** Paise, signed; 0 when absent. */
  openingBalance?: number | null;
};

/**
 * An edit of the register entry. Money fields and Aadhaar left `undefined`
 * keep their stored values (a Team Member without Financial never sees
 * them); `null` Aadhaar removes it. Working hours left out or `null` keep
 * theirs. Projects left out keep theirs; the ones ticked or unticked are
 * on or off from today (ADR CM-0033).
 */
export type UpdateLabourInput = Omit<
  LabourDetailsInput,
  "wagePerDay" | "wagePerMonth" | "overtimeWagePerHour"
> & {
  wagePerDay?: number | null;
  wagePerMonth?: number | null;
  overtimeWagePerHour?: number | null;
  openingBalance?: number | null;
  projectIds?: readonly string[];
  expectedUpdatedAt: Date;
};

export type LabourDirectories = {
  projects: ProjectDirectory;
  labourCategories: LabourCategoryDirectory;
};

export const labourNotFound = () =>
  notFound("LABOUR_NOT_FOUND", "This Labour was not found.");

/** What the audit log keeps of a labourer: never the Aadhaar number. */
export function labourSnapshot(labour: Labour) {
  const { aadhaar, ...details } = labour.details;
  return {
    ...details,
    aadhaarMasked: maskAadhaar(aadhaar),
    projectIds: [...labour.projectIds],
    isActive: labour.isActive,
  };
}

function withField(error: DomainError, field: string): DomainError {
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { field },
  });
}

/** The same error, its details extended (the field and the Labour refused). */
function withDetails(
  error: DomainError,
  details: Record<string, unknown>,
  message = error.message,
): DomainError {
  const kept =
    typeof error.details === "object" && error.details != null
      ? error.details
      : {};
  return new DomainError(error.code, message, {
    kind: error.kind,
    details: { ...kept, ...details },
  });
}

/** The most labourers one command moves (transfer, add to a Project). */
const MAX_BATCH = 500;

function remarkOf(raw: string | null | undefined): string | null {
  const remark = raw?.trim() ?? "";
  if (remark.length > 500)
    throw new DomainError(
      "REMARK_TOO_LONG",
      "The remark must be at most 500 characters.",
      { details: { field: "remark" } },
    );
  return remark.length === 0 ? null : remark;
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

  /** Projects must be live; a category live and enabled when newly chosen. */
  async assertReferences(
    workspaceId: string,
    refs: {
      projectIds?: readonly string[];
      labourCategoryId: string | null;
    },
    previous?: Pick<LabourDetails, "labourCategoryId">,
  ): Promise<void> {
    if (refs.projectIds != null && refs.projectIds.length > 0) {
      const projects = await this.directories.projects.find(
        workspaceId,
        refs.projectIds,
      );
      if (refs.projectIds.some((id) => !projects.has(id)))
        throw withField(
          notFound("PROJECT_NOT_FOUND", "This Project was not found."),
          "projectIds",
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
  }

  /**
   * Reports To (ADR CM-0035): a live, active labourer of the Company when
   * newly chosen; never the labourer themselves, and never a loop (A reports
   * to B who reports, in the end, to A).
   */
  private async assertReportsTo(
    workspaceId: string,
    labourId: string | null,
    reportsToId: string | null,
    previous: string | null = null,
  ): Promise<void> {
    if (reportsToId == null || reportsToId === previous) return;
    if (reportsToId === labourId)
      throw new DomainError(
        "REPORTS_TO_SELF",
        "A Labour cannot report to themselves.",
        { details: { field: "reportsToId" } },
      );
    const manager = await this.labours.findById(workspaceId, reportsToId);
    if (!manager?.isActive) throw reportsToNotFound();
    if (labourId == null) return;
    const seen = new Set<string>([reportsToId]);
    let next = manager.details.reportsToId;
    while (next != null && !seen.has(next)) {
      if (next === labourId) throw reportsToLoop(manager.details.name);
      seen.add(next);
      next =
        (await this.labours.findById(workspaceId, next))?.details.reportsToId ??
        null;
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
    const projectIds = uniqueProjectIds(input.labour.projectIds ?? []);
    await this.assertReferences(input.workspaceId, {
      projectIds,
      labourCategoryId: details.labourCategoryId,
    });
    await this.assertReportsTo(input.workspaceId, null, details.reportsToId);
    await this.assertCodeFree(input.workspaceId, details.labourCode);
    const now = this.clock();
    const labour = Labour.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      projectIds,
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
      workingHoursPerDay:
        patch.workingHoursPerDay == null ||
        String(patch.workingHoursPerDay).trim() === ""
          ? current.workingHoursPerDay
          : patch.workingHoursPerDay,
      aadhaar: patch.aadhaar === undefined ? current.aadhaar : patch.aadhaar,
      reportsToId:
        patch.reportsToId === undefined
          ? current.reportsToId
          : patch.reportsToId,
    });
    // Only Projects newly ticked must be live; a deleted one can be unticked.
    const wantedProjects =
      patch.projectIds === undefined
        ? null
        : uniqueProjectIds(patch.projectIds);
    await this.assertReferences(
      input.workspaceId,
      {
        projectIds: wantedProjects?.filter((id) => !labour.isOn(id)),
        labourCategoryId: details.labourCategoryId,
      },
      current,
    );
    await this.assertReportsTo(
      input.workspaceId,
      labour.id,
      details.reportsToId,
      current.reportsToId,
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

    const now = this.clock();
    labour.update(details, input.by, now);
    let projects: (ProjectChanges & { date: CalendarDate }) | null = null;
    if (wantedProjects != null) {
      const changes = labour.setProjects(wantedProjects, input.by, now);
      if (changes.added.length > 0 || changes.removed.length > 0) {
        // On or off from today; never before they joined.
        const today = await this.labours.today(input.workspaceId);
        projects = {
          ...changes,
          date: today < details.joiningDate ? details.joiningDate : today,
        };
      }
    }
    await this.labours.update({
      labour,
      expectedUpdatedAt: patch.expectedUpdatedAt,
      opening: repost ? wanted : null,
      joiningDateChanged,
      projects,
      audit: this.audit(labour, input.by, "labour.updated", {
        before: { ...before, openingBalance: stored },
        after: { ...labourSnapshot(labour), openingBalance: wanted },
      }),
    });
    return this.view(input.workspaceId, labour.id);
  }

  /**
   * A joining date may not pass the first later change of Projects (a
   * transfer, or a Project ticked or unticked on Edit) or the first
   * attendance day. The rows written with the labourer move with it.
   */
  private async assertJoiningDate(
    labour: Labour,
    joiningDate: CalendarDate,
  ): Promise<void> {
    const history = await this.labours.transfers(labour.workspaceId, labour.id);
    const firstMove = history.find(
      (row) =>
        row.fromProjectId != null ||
        row.transferDate !== labour.details.joiningDate,
    );
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
    const name = labour.details.name;
    const before = labourSnapshot(labour);
    labour.delete(input.by, this.clock());
    const result = await this.labours.delete(
      labour,
      this.audit(labour, input.by, "labour.deleted", { before }),
    );
    if (result === "has_records")
      throw conflict(
        "LABOUR_HAS_RECORDS",
        `${name} has attendance or payments. Mark them Inactive instead.`,
      );
  }

  /**
   * Moves one or more labourers from `fromProjectId` to `toProjectId` from
   * `transferDate` (CM-206); their other Projects stay (ADR CM-0033).
   * Without `fromProjectId`, each labourer leaves their only Project. All
   * or none: any refusal stops the whole command. The caller checks
   * `transfer` on the destination; this checks each source Project.
   */
  async transfer(input: {
    workspaceId: string;
    access: MemberAccess;
    labourIds: readonly string[];
    fromProjectId?: string | null;
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
      projectIds: [input.toProjectId],
      labourCategoryId: null,
    });
    const labours = await this.labours.findMany(input.workspaceId, ids);
    if (labours.length !== ids.length) throw labourNotFound();
    const sources = new Map<string, string>();
    for (const labour of labours) {
      const from = input.fromProjectId ?? onlyProject(labour);
      assertCan(input.access, "labour.labour", "transfer", {
        projectId: from,
      });
      sources.set(labour.id, from);
    }

    const history = new Map<string, CalendarDate>();
    await Promise.all(
      labours.map(async (labour) => {
        const rows = await this.labours.transfers(input.workspaceId, labour.id);
        const last = rows.at(-1);
        if (last != null) history.set(labour.id, last.transferDate);
      }),
    );
    const attendance = new Map<string, CalendarDate>();
    for (const from of new Set(sources.values())) {
      const leaving = labours
        .filter((labour) => sources.get(labour.id) === from)
        .map((labour) => labour.id);
      for (const [id, date] of await this.labours.latestAttendance(
        input.workspaceId,
        leaving,
        from,
      ))
        attendance.set(id, date);
    }
    const now = this.clock();
    const moves: LabourMove[] = [];
    const audits: AuditEvent[] = [];
    for (const labour of labours) {
      const fromProjectId = sources.get(labour.id) ?? "";
      const before = [...labour.projectIds];
      const loadedUpdatedAt = labour.updatedAt;
      labour.transfer(fromProjectId, input.toProjectId, input.by, now);
      assertTransferDate({
        name: labour.details.name,
        transferDate,
        lastTransferDate: history.get(labour.id) ?? null,
        latestAttendanceDate: attendance.get(labour.id) ?? null,
      });
      moves.push({
        labour,
        fromProjectId,
        toProjectId: input.toProjectId,
        loadedUpdatedAt,
        transferDate,
        remark: remark.length === 0 ? null : remark,
      });
      audits.push(
        this.audit(labour, input.by, "labour.transferred", {
          before: { projectIds: before },
          after: {
            projectIds: [...labour.projectIds],
            fromProjectId,
            toProjectId: input.toProjectId,
            transferDate,
            remark: remark.length === 0 ? null : remark,
          },
        }),
      );
    }
    await this.labours.transfer(moves, audits);
    return Promise.all(ids.map((id) => this.view(input.workspaceId, id)));
  }

  /** A Project's labourers for its Resources, by name (ADR CM-0038 §2). */
  onProject(filter: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
    after?: NameCursor;
    before?: NameCursor;
  }): Promise<ProjectLabourPage> {
    return this.queries.onProject(filter);
  }

  countOnProject(workspaceId: string, projectId: string): Promise<number> {
    return this.queries.countOnProject(workspaceId, projectId);
  }

  /** Active labourers not on the Project, for its Add Labours picker. */
  addableToProject(input: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
  }): Promise<{ items: ProjectLabourChoice[]; hasMore: boolean }> {
    return this.queries.addableToProject(input);
  }

  /** The date typed, or today in the Company's time zone when left out. */
  private async dateOr(
    workspaceId: string,
    raw: string | null | undefined,
    field: string,
    code: string,
  ): Promise<CalendarDate> {
    const typed = raw?.trim() ?? "";
    if (typed === "") return this.labours.today(workspaceId);
    try {
      return assertCalendarDate(typed, code);
    } catch (error) {
      if (error instanceof DomainError) throw withField(error, field);
      throw error;
    }
  }

  /** The date of each labourer's last history row. */
  private async lastMoves(
    workspaceId: string,
    labours: readonly Labour[],
  ): Promise<Map<string, CalendarDate>> {
    const last = new Map<string, CalendarDate>();
    await Promise.all(
      labours.map(async (labour) => {
        const rows = await this.labours.transfers(workspaceId, labour.id);
        const date = rows.at(-1)?.transferDate;
        if (date != null) last.set(labour.id, date);
      }),
    );
    return last;
  }

  /**
   * Adds labourers to a Project from a date (`from`, today when left out),
   * from the Project's Resources (ADR CM-0038 §2). Their other Projects
   * stay. All or none: the first refusal stops the command and names the
   * labourer (`details.labourId`) and, for a date, the field. The caller
   * has checked the Project is visible to the viewer.
   */
  async addToProject(input: {
    workspaceId: string;
    projectId: string;
    labourIds: readonly string[];
    from?: string | null;
    remark?: string | null;
    by: string;
  }): Promise<void> {
    const ids = [...new Set(input.labourIds)];
    if (ids.length === 0)
      throw new DomainError("LABOURS_REQUIRED", "Choose at least one Labour.", {
        details: { field: "labourIds" },
      });
    if (ids.length > MAX_BATCH)
      throw new DomainError(
        "TOO_MANY_LABOURS",
        `Add at most ${String(MAX_BATCH)} Labours at a time.`,
        { details: { field: "labourIds" } },
      );
    const remark = remarkOf(input.remark);
    const from = await this.dateOr(
      input.workspaceId,
      input.from,
      "from",
      "FROM_DATE_INVALID",
    );
    await this.assertReferences(input.workspaceId, {
      projectIds: [input.projectId],
      labourCategoryId: null,
    });
    const labours = await this.labours.findMany(input.workspaceId, ids);
    const found = new Set(labours.map((labour) => labour.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing != null)
      throw withDetails(labourNotFound(), { labourId: missing });
    const lastMoves = await this.lastMoves(input.workspaceId, labours);

    const now = this.clock();
    const changes: { labour: Labour; loadedUpdatedAt: Date }[] = [];
    const audits: AuditEvent[] = [];
    for (const labour of labours) {
      const loadedUpdatedAt = labour.updatedAt;
      const before = [...labour.projectIds];
      labour.joinProject(input.projectId, input.by, now);
      const { name, joiningDate } = labour.details;
      if (from < joiningDate)
        throw new DomainError(
          "FROM_BEFORE_JOINING_DATE",
          `${name} joined on ${joiningDate}. Choose that date or later.`,
          {
            details: { field: "from", labourId: labour.id, joiningDate },
          },
        );
      try {
        assertTransferDate({
          name,
          transferDate: from,
          lastTransferDate: lastMoves.get(labour.id) ?? null,
          latestAttendanceDate: null,
        });
      } catch (error) {
        if (error instanceof DomainError)
          throw withDetails(error, { field: "from", labourId: labour.id });
        throw error;
      }
      changes.push({ labour, loadedUpdatedAt });
      audits.push(
        this.audit(labour, input.by, "labour.projects_changed", {
          before: { projectIds: before },
          after: {
            projectIds: [...labour.projectIds],
            projectId: input.projectId,
            from,
            remark,
          },
        }),
      );
    }
    await this.labours.changeProject({
      projectId: input.projectId,
      direction: "join",
      labours: changes,
      date: from,
      remark,
      audits,
    });
  }

  /**
   * Takes a labourer off a Project after their `lastDay` (today when left
   * out), from the Project's Resources (ADR CM-0038 §2). The history row is
   * dated the day after, their first day off it (ADR CM-0033). Attendance,
   * wages and payments already recorded stay. The Last day may not come
   * before an attendance day on the Project, or before their last move.
   */
  async removeFromProject(input: {
    workspaceId: string;
    projectId: string;
    labourId: string;
    lastDay?: string | null;
    remark?: string | null;
    by: string;
  }): Promise<void> {
    const remark = remarkOf(input.remark);
    const lastDay = await this.dateOr(
      input.workspaceId,
      input.lastDay,
      "lastDay",
      "LAST_DAY_INVALID",
    );
    const firstDayOff = addDays(lastDay, 1);
    const labour = await this.labours.findById(
      input.workspaceId,
      input.labourId,
    );
    if (labour == null)
      throw withDetails(labourNotFound(), { labourId: input.labourId });
    const loadedUpdatedAt = labour.updatedAt;
    const before = [...labour.projectIds];
    labour.leaveProject(input.projectId, input.by, this.clock());

    const name = labour.details.name;
    const lastMove =
      (await this.lastMoves(input.workspaceId, [labour])).get(labour.id) ??
      null;
    const attendance =
      (
        await this.labours.latestAttendance(
          input.workspaceId,
          [labour.id],
          input.projectId,
        )
      ).get(labour.id) ?? null;
    try {
      assertTransferDate({
        name,
        transferDate: firstDayOff,
        lastTransferDate: lastMove,
        latestAttendanceDate: attendance,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      // The rule speaks of the history row's date; the screen of the Last day.
      const message =
        error.code === "TRANSFER_BEFORE_ATTENDANCE"
          ? `${name} has attendance on this Project up to ${attendance ?? ""}. Choose that day or later as the Last day.`
          : `${name}'s Projects last changed on ${lastMove ?? ""}. Choose ${lastMove == null ? "" : addDays(lastMove, -1)} or later as the Last day.`;
      throw withDetails(
        error,
        { field: "lastDay", labourId: labour.id },
        message,
      );
    }

    await this.labours.changeProject({
      projectId: input.projectId,
      direction: "leave",
      labours: [{ labour, loadedUpdatedAt }],
      date: firstDayOff,
      remark,
      audits: [
        this.audit(labour, input.by, "labour.projects_changed", {
          before: { projectIds: before },
          after: {
            projectIds: [...labour.projectIds],
            projectId: input.projectId,
            lastDay,
            remark,
          },
        }),
      ],
    });
  }

  /** The labourer's history, oldest first, with Project names. */
  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<
    (LabourTransferRecord & {
      fromProject: { id: string; name: string } | null;
      toProject: { id: string; name: string } | null;
    })[]
  > {
    await this.load(workspaceId, id);
    const rows = await this.labours.transfers(workspaceId, id);
    const names = await this.directories.projects.find(
      workspaceId,
      rows.flatMap((row) =>
        [row.fromProjectId, row.toProjectId].filter(
          (projectId): projectId is string => projectId != null,
        ),
      ),
    );
    const project = (projectId: string | null) =>
      projectId == null
        ? null
        : (names.get(projectId) ?? { id: projectId, name: "Deleted Project" });
    return rows.map((row) => ({
      ...row,
      fromProject: project(row.fromProjectId),
      toProject: project(row.toProjectId),
    }));
  }
}

/** The Project a labourer leaves when the transfer names none. */
function onlyProject(labour: Labour): string {
  const [only, ...more] = labour.projectIds;
  if (only == null || more.length > 0)
    throw new DomainError(
      "TRANSFER_FROM_PROJECT_REQUIRED",
      `${labour.details.name} works on ${labour.projectIds.length === 0 ? "no Project" : "more than one Project"}. Choose the Project they move from.`,
      { details: { labourId: labour.id, field: "fromProjectId" } },
    );
  return only;
}

export function labourCodeTaken(): DomainError {
  return new DomainError(
    "LABOUR_CODE_TAKEN",
    "Another Labour has this Labour Id.",
    { kind: "conflict", details: { field: "labourCode" } },
  );
}

export function reportsToNotFound(): DomainError {
  return withField(
    notFound(
      "REPORTS_TO_NOT_FOUND",
      "This Labour was not found or is inactive.",
    ),
    "reportsToId",
  );
}

/** The chosen Labour already reports, directly or through others, to this one. */
export function reportsToLoop(name = "The chosen Labour"): DomainError {
  return new DomainError(
    "REPORTS_TO_LOOP",
    `${name} reports to this Labour, so this Labour cannot report to them.`,
    { details: { field: "reportsToId" } },
  );
}
