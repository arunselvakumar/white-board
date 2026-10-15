import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { TASK_LIMITS, TASK_MAX_DEPTH } from "../domain/task";
import { parseQuantity } from "../domain/task-progress";
import {
  isTrackingPriority,
  type TrackingPriority,
} from "../domain/tracking-documents";
import type { TaskTags, TrackingDirectory } from "./ports";
import { TASK_MENU, type TaskDb } from "./task-handlers";
import type { NewActivity, TaskStore } from "./task-store";

/**
 * Import tasks from the xlsx sample (CM-802, ADR CM-0019 §13): all rows or
 * none, at most 1,000, every problem named by its row and column. Ref /
 * Parent Ref rebuild the tree (three levels); masters match by name, any
 * case; an assignee must match exactly one Team Member on the Project;
 * unknown tags are created when the member holds Tags Create. Imported
 * tasks start Not Started with their baseline from their dates.
 */

export const TASK_IMPORT_COLUMNS = [
  { key: "ref", header: "Ref", width: 10 },
  { key: "parentRef", header: "Parent Ref", width: 12 },
  { key: "name", header: "Task Name*", width: 36 },
  { key: "description", header: "Description", width: 36 },
  { key: "startDate", header: "Start Date", width: 14 },
  { key: "dueDate", header: "Due Date", width: 14 },
  { key: "priority", header: "Priority", width: 10 },
  { key: "assignees", header: "Assignees", width: 28 },
  { key: "department", header: "Department", width: 20 },
  { key: "contractor", header: "Contractor", width: 24 },
  { key: "tags", header: "Tags", width: 20 },
  { key: "totalWork", header: "Total Work", width: 12 },
  { key: "unit", header: "Unit", width: 10 },
  { key: "totalPrice", header: "Total Price", width: 16 },
] as const;

export type TaskImportColumnKey = (typeof TASK_IMPORT_COLUMNS)[number]["key"];

export type ImportCell = string | number | Date | null;

export type TaskSheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<TaskImportColumnKey, ImportCell>>;
};

export type ImportRowError = { row: number; field: string; message: string };

export const TASK_IMPORT_MAX_ROWS = 1000;

/** Longest tag name the masters accept. */
const TAG_NAME_MAX = 100;

const HEADER_OF = Object.fromEntries(
  TASK_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<TaskImportColumnKey, string>;

function text(cell: ImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim().replace(/\s+/g, " ");
}

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** A date cell: an Excel date, `YYYY-MM-DD`, or `DD/MM/YYYY` (or `-`, `.`). */
export function importDate(cell: ImportCell | undefined): CalendarDate | null {
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime())
      ? null
      : cell.toISOString().slice(0, 10);
  const value = text(cell);
  if (isCalendarDate(value)) return value;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match == null) return null;
  const date = `${match[3] ?? ""}-${(match[2] ?? "").padStart(2, "0")}-${(match[1] ?? "").padStart(2, "0")}`;
  return isCalendarDate(date) ? date : null;
}

/** Rupees as a number or text (`1,500.50`) → paise; null when not an amount. */
export function importRupees(cell: ImportCell | undefined): bigint | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || cell < 0) return null;
    const paise = Math.round(cell * 100);
    if (Math.abs(cell * 100 - paise) > 1e-6) return null;
    return BigInt(paise);
  }
  const value = text(cell).replace(/[,₹\s]/g, "");
  const match = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(value);
  if (match == null) return null;
  return (
    BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

/** Comma-separated names, cleaned, without blanks or repeats. */
function names(cell: ImportCell | undefined): string[] {
  const seen = new Map<string, string>();
  for (const part of text(cell).split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    if (name !== "" && !seen.has(key(name))) seen.set(key(name), name);
  }
  return [...seen.values()];
}

export type TaskImportDeps = {
  db: TaskDb;
  store: TaskStore;
  directory: TrackingDirectory;
  tags: TaskTags;
  clock?: () => Date;
};

/** One row, read and matched, before it is written. */
type Planned = {
  row: number;
  ref: string | null;
  parentRef: string | null;
  name: string;
  description: string | null;
  startDate: CalendarDate | null;
  dueDate: CalendarDate | null;
  priority: TrackingPriority | null;
  assigneeIds: string[];
  departmentId: string | null;
  contractorId: string | null;
  tagIds: string[];
  /** Tag names to create (Tags Create), by lower-cased name. */
  newTags: string[];
  totalWorkMilli: bigint | null;
  totalWorkUnitId: string | null;
  totalPrice: bigint | null;
};

/**
 * Checks every row, then writes them all in one transaction. Any error
 * anywhere rolls back everything: 400 `IMPORT_HAS_ERRORS` with
 * `details.errors` = [{ row, field, message }].
 */
export async function importTasks(
  deps: TaskImportDeps,
  access: MemberAccess,
  projectId: string,
  rows: readonly TaskSheetRow[],
): Promise<{ imported: number }> {
  assertCan(access, TASK_MENU, "create", { projectId });
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > TASK_IMPORT_MAX_ROWS)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${String(TASK_IMPORT_MAX_ROWS)} rows at a time.`,
    );
  const workspaceId = access.workspaceId;
  const financial = can(access, TASK_MENU, "financial", { projectId });
  const tagCreate = can(access, "masters.tags", "create");
  const options = await deps.directory.options(
    deps.db,
    workspaceId,
    projectId,
    ["members", "departments", "contractors", "units", "tags"],
  );
  const members = new Map<string, string[]>();
  for (const member of options.members)
    members.set(key(member.name), [
      ...(members.get(key(member.name)) ?? []),
      member.id,
    ]);
  const byName = (list: readonly { id: string; name: string }[]) =>
    new Map(list.map((item) => [key(item.name), item.id]));
  const departments = byName(options.departments);
  const contractors = byName(options.contractors);
  const units = byName(options.units);
  const tags = byName(options.tags);

  const errors: ImportRowError[] = [];
  const planned: Planned[] = [];
  const refs = new Map<string, number>();
  for (const { row, cells } of rows) {
    const fail = (column: TaskImportColumnKey, message: string) => {
      errors.push({ row, field: HEADER_OF[column], message });
    };
    const ref = text(cells.ref) === "" ? null : text(cells.ref);
    if (ref != null) {
      const first = refs.get(key(ref));
      if (first != null)
        fail("ref", `Ref “${ref}” is already used on row ${String(first)}.`);
      else refs.set(key(ref), row);
    }
    const parentRef =
      text(cells.parentRef) === "" ? null : text(cells.parentRef);
    const name = text(cells.name);
    if (name === "") fail("name", "Enter the task's name.");
    else if (name.length > TASK_LIMITS.name)
      fail("name", `Keep the name to ${String(TASK_LIMITS.name)} characters.`);
    const description = text(cells.description);
    if (description.length > TASK_LIMITS.description)
      fail(
        "description",
        `Keep the description to ${String(TASK_LIMITS.description)} characters.`,
      );
    const dateOf = (column: "startDate" | "dueDate") => {
      if (text(cells[column]) === "") return null;
      const date = importDate(cells[column]);
      if (date == null) fail(column, "Enter the date as DD/MM/YYYY.");
      return date;
    };
    const startDate = dateOf("startDate");
    const dueDate = dateOf("dueDate");
    if (startDate != null && dueDate != null && dueDate < startDate)
      fail("dueDate", "The Due Date cannot be before the Start Date.");
    const priorityText = key(text(cells.priority));
    if (priorityText !== "" && !isTrackingPriority(priorityText))
      fail("priority", "Write High, Medium or Low.");
    const assigneeIds: string[] = [];
    for (const person of names(cells.assignees)) {
      const found = members.get(key(person)) ?? [];
      if (found.length === 1 && found[0] != null) assigneeIds.push(found[0]);
      else
        fail(
          "assignees",
          found.length === 0
            ? `No Team Member on this Project is named “${person}”.`
            : `More than one Team Member is named “${person}”; assign them on the task.`,
        );
    }
    const matched = (
      column: "department" | "contractor" | "unit",
      map: ReadonlyMap<string, string>,
      what: string,
    ) => {
      const value = text(cells[column]);
      if (value === "") return null;
      const id = map.get(key(value));
      if (id == null) fail(column, `No ${what} is named “${value}”.`);
      return id ?? null;
    };
    const departmentId = matched(
      "department",
      departments,
      "Department in use",
    );
    const contractorId = matched(
      "contractor",
      contractors,
      "Contractor on this Project",
    );
    const totalWorkUnitId = matched("unit", units, "Measurement Unit in use");
    const tagIds: string[] = [];
    const newTags: string[] = [];
    for (const tag of names(cells.tags)) {
      const id = tags.get(key(tag));
      if (id != null) tagIds.push(id);
      else if (tag.length > TAG_NAME_MAX)
        fail("tags", `Keep tag names to ${String(TAG_NAME_MAX)} characters.`);
      else if (tagCreate) newTags.push(tag);
      else
        fail(
          "tags",
          `No tag is named “${tag}”, and you cannot create tags. Ask the Owner for Tags Add.`,
        );
    }
    if (tagIds.length + newTags.length > TASK_LIMITS.tags)
      fail("tags", `Give a task at most ${String(TASK_LIMITS.tags)} tags.`);
    let totalWorkMilli: bigint | null = null;
    if (text(cells.totalWork) !== "")
      try {
        totalWorkMilli = parseQuantity(
          typeof cells.totalWork === "number"
            ? cells.totalWork
            : text(cells.totalWork).replace(/,/g, ""),
          "totalWork",
        );
      } catch {
        fail("totalWork", "Enter a quantity above 0, at most three decimals.");
      }
    if (totalWorkMilli != null && text(cells.unit) === "")
      fail("unit", "Write the unit of the Total Work.");
    if (
      totalWorkMilli == null &&
      text(cells.unit) !== "" &&
      text(cells.totalWork) === ""
    )
      fail(
        "totalWork",
        "Enter the Total Work in this unit, or clear the unit.",
      );
    let totalPrice: bigint | null = null;
    if (text(cells.totalPrice) !== "") {
      if (!financial)
        fail(
          "totalPrice",
          "Prices need Task Financial; leave the column empty.",
        );
      else {
        totalPrice = importRupees(cells.totalPrice);
        if (totalPrice == null || totalPrice > TASK_LIMITS.totalPrice)
          fail("totalPrice", "Enter the price in rupees, like 150000.50.");
      }
    }
    planned.push({
      row,
      ref,
      parentRef,
      name,
      description: description === "" ? null : description,
      startDate,
      dueDate,
      priority: priorityText === "" ? null : (priorityText as TrackingPriority),
      assigneeIds: [...new Set(assigneeIds)],
      departmentId,
      contractorId,
      tagIds: [...new Set(tagIds)],
      newTags,
      totalWorkMilli,
      totalWorkUnitId: totalWorkMilli == null ? null : totalWorkUnitId,
      totalPrice,
    });
  }

  // The tree: parents exist in the file, no cycles, three levels at most.
  const byRef = new Map<string, Planned>();
  for (const item of planned)
    if (item.ref != null && !byRef.has(key(item.ref)))
      byRef.set(key(item.ref), item);
  const depthOf = new Map<Planned, number>();
  const depth = (item: Planned, seen: Set<Planned>): number => {
    const known = depthOf.get(item);
    if (known != null) return known;
    if (item.parentRef == null) return 1;
    const parent = byRef.get(key(item.parentRef));
    if (parent == null || seen.has(parent)) return Number.NaN;
    const value = depth(parent, new Set([...seen, item])) + 1;
    depthOf.set(item, value);
    return value;
  };
  for (const item of planned) {
    if (item.parentRef == null) {
      depthOf.set(item, 1);
      continue;
    }
    const parent = byRef.get(key(item.parentRef));
    const fail = (message: string) => {
      errors.push({ row: item.row, field: HEADER_OF.parentRef, message });
    };
    if (parent == null) fail(`No row has Ref “${item.parentRef}”.`);
    else if (parent === item) fail("A task cannot be its own parent.");
    else {
      const value = depth(item, new Set());
      if (Number.isNaN(value)) fail("These Parent Refs go round in a circle.");
      else if (value > TASK_MAX_DEPTH)
        fail(
          "Tasks go three levels deep at most: a task, its sub-tasks and theirs.",
        );
    }
  }
  if (errors.length > 0)
    throw new DomainError(
      "IMPORT_HAS_ERRORS",
      errors.length === 1
        ? "One row has a problem; nothing was imported."
        : `${String(errors.length)} problems; nothing was imported.`,
      { details: { errors: errors.sort((a, b) => a.row - b.row) } },
    );

  // Unknown tags: created through the masters before the tasks.
  const wanted = [...new Set(planned.flatMap((item) => item.newTags.map(key)))];
  const created =
    wanted.length === 0
      ? new Map<string, string>()
      : await deps.tags.ensure(
          workspaceId,
          access.userId,
          wanted.map(
            (lower) =>
              planned
                .flatMap((item) => item.newTags)
                .find((tag) => key(tag) === lower) ?? lower,
          ),
        );

  const at = (deps.clock ?? (() => new Date()))();
  const by = access.userId;
  const ordered = [...planned].sort(
    (a, b) => (depthOf.get(a) ?? 1) - (depthOf.get(b) ?? 1) || a.row - b.row,
  );
  await deps.db.$transaction(
    async (tx) => {
      const first = await deps.store.allocateNumbers(
        tx,
        workspaceId,
        projectId,
        planned.length,
      );
      const ids = new Map<Planned, string>();
      const numbers = new Map<Planned, number>(
        planned.map((item, index) => [item, first + index]),
      );
      const nextOrder = new Map<string, number>();
      const activities: NewActivity[] = [];
      for (const item of ordered) {
        const id = newId(at.getTime());
        ids.set(item, id);
        const parent =
          item.parentRef == null ? null : byRef.get(key(item.parentRef));
        const parentId = parent == null ? null : (ids.get(parent) ?? null);
        const slot = parentId ?? "";
        const sortOrder =
          nextOrder.get(slot) ??
          (await deps.store.nextSortOrder(tx, projectId, parentId));
        nextOrder.set(slot, sortOrder + 1);
        const taskNo = numbers.get(item) ?? first;
        await deps.store.insert(tx, {
          id,
          workspaceId,
          projectId,
          taskNo,
          parentId,
          depth: depthOf.get(item) ?? 1,
          sortOrder,
          copiedFromId: null,
          name: item.name,
          description: item.description,
          startDate: item.startDate,
          dueDate: item.dueDate,
          priority: item.priority,
          siteLocation: null,
          extraLocations: [],
          departmentId: item.departmentId,
          contractorId: item.contractorId,
          totalWorkMilli: item.totalWorkMilli,
          totalWorkUnitId: item.totalWorkUnitId,
          totalPrice: item.totalPrice,
          assigneeIds: item.assigneeIds,
          tagIds: [
            ...new Set([
              ...item.tagIds,
              ...item.newTags.flatMap((tag) => created.get(key(tag)) ?? []),
            ]),
          ],
          by,
          at,
        });
        activities.push({
          taskId: id,
          kind: "created",
          payload: { taskNo, name: item.name, imported: true },
        });
      }
      // Baselines for leaf tasks with both dates (CM-0019 §3, §13).
      const parents = new Set(
        planned.flatMap((item) =>
          item.parentRef == null
            ? []
            : [byRef.get(key(item.parentRef))].filter(
                (p): p is Planned => p != null,
              ),
        ),
      );
      for (const item of planned) {
        const id = ids.get(item);
        if (
          id == null ||
          parents.has(item) ||
          item.startDate == null ||
          item.dueDate == null
        )
          continue;
        await deps.store.addBaseline(tx, {
          workspaceId,
          taskId: id,
          version: 1,
          startDate: item.startDate,
          endDate: item.dueDate,
          reason: null,
          by,
          at,
        });
      }
      await deps.store.addActivities(tx, workspaceId, by, at, activities);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "task.imported",
        entityType: "project",
        entityId: projectId,
        after: { tasks: planned.length, firstTaskNo: first },
        occurredAt: at,
      });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return { imported: planned.length };
}
