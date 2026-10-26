import type { MemberAccess } from "@/src/shared-kernel/access";
import { PermissionSet } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";

import { Labour, type ProjectChanges } from "../domain/labour";
import type { LabourDirectories } from "./labour-handlers";
import type {
  LabourMove,
  LabourQueries,
  LabourReadModel,
  LabourRepository,
  LabourTransferRecord,
  NewLabour,
} from "./labour-ports";

/** In-memory labour register for handler tests (no Prisma). */
export class FakeLabourRepository implements LabourRepository {
  readonly labours = new Map<string, Labour>();
  /** Opening entries per labourer, signed; reversals included. */
  readonly ledger = new Map<string, number[]>();
  readonly history = new Map<string, LabourTransferRecord[]>();
  readonly attendance = new Map<string, CalendarDate[]>();
  readonly payments = new Set<string>();
  readonly audits: AuditEvent[] = [];

  private copy(labour: Labour): Labour {
    return Labour.reconstitute({
      id: labour.id,
      workspaceId: labour.workspaceId,
      details: { ...labour.details },
      projectIds: [...labour.projectIds],
      isActive: labour.isActive,
      createdAt: labour.createdAt,
      updatedAt: labour.updatedAt,
      createdBy: labour.createdBy,
      updatedBy: labour.updatedBy,
      deletedAt: labour.deletedAt,
    });
  }

  findById(workspaceId: string, id: string): Promise<Labour | null> {
    const found = this.labours.get(id);
    return Promise.resolve(
      found?.workspaceId !== workspaceId || found.deletedAt != null
        ? null
        : this.copy(found),
    );
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Labour[]> {
    const found = await Promise.all(
      ids.map((id) => this.findById(workspaceId, id)),
    );
    return found.filter((item): item is Labour => item != null);
  }

  codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>> {
    const wanted = new Set(codes.map((code) => code.toLowerCase()));
    const taken = new Set<string>();
    for (const labour of this.labours.values()) {
      const code = labour.details.labourCode?.toLowerCase();
      if (
        code != null &&
        labour.workspaceId === workspaceId &&
        labour.deletedAt == null &&
        labour.id !== exceptId &&
        wanted.has(code)
      )
        taken.add(code);
    }
    return Promise.resolve(taken);
  }

  openingBalance(_workspaceId: string, id: string): Promise<number> {
    return Promise.resolve(
      (this.ledger.get(id) ?? []).reduce((sum, amount) => sum + amount, 0),
    );
  }

  insert(
    items: readonly NewLabour[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    for (const { labour, openingBalance } of items) {
      this.labours.set(labour.id, this.copy(labour));
      this.ledger.set(labour.id, openingBalance === 0 ? [] : [openingBalance]);
      this.history.set(
        labour.id,
        labour.projectIds.map((projectId, index) => ({
          id: `${labour.id}-${String(index)}`,
          fromProjectId: null,
          toProjectId: projectId,
          transferDate: labour.details.joiningDate,
          remark: null,
          createdAt: labour.createdAt,
          createdBy: labour.createdBy,
        })),
      );
    }
    this.audits.push(...audits);
    return Promise.resolve();
  }

  update(input: {
    labour: Labour;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    projects?: (ProjectChanges & { date: CalendarDate }) | null;
    audit: AuditEvent;
  }): Promise<void> {
    const stored = this.labours.get(input.labour.id);
    if (
      input.expectedUpdatedAt != null &&
      stored?.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    )
      return Promise.reject(conflict("LABOUR_CHANGED", "Changed."));
    this.labours.set(input.labour.id, this.copy(input.labour));
    const history = this.history.get(input.labour.id) ?? [];
    const row = (from: string | null, to: string | null, date: CalendarDate) =>
      history.push({
        id: `${input.labour.id}-${String(history.length)}`,
        fromProjectId: from,
        toProjectId: to,
        transferDate: date,
        remark: null,
        createdAt: input.labour.updatedAt,
        createdBy: input.labour.updatedBy,
      });
    if (input.projects != null) {
      const { date } = input.projects;
      for (const id of input.projects.removed) row(id, null, date);
      for (const id of input.projects.added) row(null, id, date);
    }
    this.history.set(input.labour.id, history);
    if (input.opening != null) {
      const entries = this.ledger.get(input.labour.id) ?? [];
      const live = entries.reduce((sum, amount) => sum + amount, 0);
      this.ledger.set(input.labour.id, [...entries, -live, input.opening]);
    }
    this.audits.push(input.audit);
    return Promise.resolve();
  }

  delete(
    labour: Labour,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records"> {
    if (
      (this.attendance.get(labour.id)?.length ?? 0) > 0 ||
      this.payments.has(labour.id)
    )
      return Promise.resolve("has_records");
    this.labours.set(labour.id, this.copy(labour));
    const entries = this.ledger.get(labour.id) ?? [];
    const live = entries.reduce((sum, amount) => sum + amount, 0);
    this.ledger.set(labour.id, [...entries, -live]);
    this.audits.push(audit);
    return Promise.resolve("deleted");
  }

  transfer(
    moves: readonly LabourMove[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    for (const move of moves) {
      this.labours.set(move.labour.id, this.copy(move.labour));
      this.history.get(move.labour.id)?.push({
        id: `${move.labour.id}-${String(this.history.get(move.labour.id)?.length ?? 0)}`,
        fromProjectId: move.fromProjectId,
        toProjectId: move.toProjectId,
        transferDate: move.transferDate,
        remark: move.remark,
        createdAt: move.labour.updatedAt,
        createdBy: move.labour.updatedBy,
      });
    }
    this.audits.push(...audits);
    return Promise.resolve();
  }

  /** Today, as the handler tests see it. */
  todayIs: CalendarDate = "2026-10-08";

  today(): Promise<CalendarDate> {
    return Promise.resolve(this.todayIs);
  }

  /** Attendance here is on any Project. */
  latestAttendance(
    _workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CalendarDate>> {
    const latest = new Map<string, CalendarDate>();
    for (const id of ids) {
      const days = [...(this.attendance.get(id) ?? [])].sort();
      const last = days.at(-1);
      if (last != null) latest.set(id, last);
    }
    return Promise.resolve(latest);
  }

  earliestAttendance(
    _workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null> {
    return Promise.resolve(
      [...(this.attendance.get(id) ?? [])].sort()[0] ?? null,
    );
  }

  transfers(_workspaceId: string, id: string): Promise<LabourTransferRecord[]> {
    return Promise.resolve([...(this.history.get(id) ?? [])]);
  }
}

/** Read models straight from the fake repository. */
export function fakeQueries(repository: FakeLabourRepository): LabourQueries {
  const view = async (
    workspaceId: string,
    id: string,
  ): Promise<LabourReadModel | null> => {
    const labour = await repository.findById(workspaceId, id);
    if (labour == null) return null;
    const { aadhaar, ...details } = labour.details;
    const opening = await repository.openingBalance(workspaceId, id);
    return {
      id: labour.id,
      details,
      aadhaarMasked: aadhaar == null ? null : `XXXXXXXX${aadhaar.slice(-4)}`,
      projects: labour.projectIds.map((projectId) => ({
        id: projectId,
        name: projectId,
      })),
      labourCategory: null,
      supervisor: null,
      isActive: labour.isActive,
      photoKey: null,
      openingBalance: opening,
      balance: opening,
      createdAt: labour.createdAt,
      updatedAt: labour.updatedAt,
    };
  };
  return {
    get: view,
    list: () => Promise.reject(new Error("not in fakes")),
    all: () => Promise.reject(new Error("not in fakes")),
    options: () => Promise.reject(new Error("not in fakes")),
  };
}

/** Directories holding exactly these ids; `disabled` ids exist but are off. */
export function fakeDirectories(input: {
  projects?: string[];
  labourCategories?: string[];
  supervisors?: string[];
  disabled?: string[];
}): LabourDirectories {
  const find =
    (ids: string[] = []) =>
    (_workspaceId: string, wanted: readonly string[]) =>
      Promise.resolve(
        new Map(
          wanted
            .filter((id) => ids.includes(id))
            .map((id) => [
              id,
              { id, name: id, disabled: input.disabled?.includes(id) ?? false },
            ]),
        ),
      );
  return {
    projects: { find: find(input.projects) },
    labourCategories: { find: find(input.labourCategories) },
    supervisors: { find: find(input.supervisors) },
  };
}

/** A Member with `labour.labour` transfer on `projectIds` only. */
export function transferAccess(projectIds: string[]): MemberAccess {
  return {
    workspaceId: "w1",
    userId: "u2",
    role: "member",
    permissions: PermissionSet.fromGrants({ "labour.labour": ["transfer"] }),
    projectIds: new Set(projectIds),
  };
}
