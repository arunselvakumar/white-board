import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { inquiryFields } from "../domain/inquiry";
import {
  INTEREST_TYPE_LABELS,
  INTEREST_TYPES,
  normaliseMobile,
  SALES_LIMITS,
  type InterestType,
} from "../domain/sales-terms";
import { toStoredFollowUpAt, type SalesDateTime } from "../domain/sales-time";
import type {
  InquiryContent,
  InquiryDeps,
  NewInquiryEvent,
} from "./inquiry-handlers";

/**
 * Inquiry import (CM-1007, ADR CM-0022 §9): an Excel sheet of leads, one
 * per row, added to a Project all or none. Lead Source, Funnel Stage and
 * Wing must match live names of the Project (they are never created); the
 * Assignee is matched by a Project Team Member's name or mobile and must
 * be unique. At most 1,000 rows; every problem by row.
 */

export const INQUIRY_IMPORT_COLUMNS = [
  { key: "inquiryDate", header: "Inquiry Date", width: 14 },
  { key: "name", header: "Name*", width: 24 },
  { key: "mobile", header: "Mobile", width: 16 },
  { key: "email", header: "Email", width: 26 },
  { key: "address", header: "Address", width: 30 },
  { key: "occupation", header: "Occupation", width: 16 },
  { key: "interestType", header: "Interest Type", width: 13 },
  { key: "wing", header: "Interested In Wing", width: 18 },
  { key: "unitType", header: "Unit type", width: 12 },
  { key: "leadSource", header: "Lead Source", width: 16 },
  { key: "stage", header: "Funnel Stage", width: 16 },
  { key: "assignee", header: "Assignee", width: 20 },
  { key: "nextFollowUp", header: "Next follow-up", width: 18 },
  { key: "remarks", header: "Remarks", width: 30 },
] as const;

export type InquiryImportColumnKey =
  (typeof INQUIRY_IMPORT_COLUMNS)[number]["key"];

export type InquiryImportCell = string | number | Date | null;

export type InquirySheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<InquiryImportColumnKey, InquiryImportCell>>;
};

export type InquiryImportRowError = {
  row: number;
  field: string;
  message: string;
};

/** The names the sample's Lists sheet offers. */
export type InquiryImportLists = {
  leadSources: string[];
  funnelStages: string[];
  wings: string[];
  members: string[];
};

const HEADER_OF = Object.fromEntries(
  INQUIRY_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<InquiryImportColumnKey, string>;

/** Domain fields (`details.field`) to the sheet's columns. */
const COLUMN_OF_FIELD: Record<string, InquiryImportColumnKey> = {
  inquiryDate: "inquiryDate",
  name: "name",
  mobile: "mobile",
  email: "email",
  address: "address",
  occupation: "occupation",
  interestType: "interestType",
  interestedUnitType: "unitType",
  remarks: "remarks",
  nextFollowUp: "nextFollowUp",
};

const BACKDATED_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

function text(cell: InquiryImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim().replace(/\s+/g, " ");
}

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const pad = (value: string) => value.padStart(2, "0");

/**
 * A sheet date: an Excel date cell, `YYYY-MM-DD` or `DD-MM-YYYY` /
 * `DD/MM/YYYY`; null for something else.
 */
export function sheetDate(
  cell: InquiryImportCell | undefined,
): CalendarDate | null {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const value = text(cell);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const indian = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  const date =
    iso != null
      ? `${iso[1] ?? ""}-${pad(iso[2] ?? "")}-${pad(iso[3] ?? "")}`
      : indian != null
        ? `${indian[3] ?? ""}-${pad(indian[2] ?? "")}-${pad(indian[1] ?? "")}`
        : null;
  return date != null && isCalendarDate(date) ? date : null;
}

/** "2026-10-20", "20-10-2026 10:30" or an Excel date (with its time when set). */
function sheetDateTime(
  cell: InquiryImportCell | undefined,
): SalesDateTime | null | "invalid" {
  if (cell == null || text(cell) === "") return null;
  if (cell instanceof Date) {
    const time = cell.toISOString().slice(11, 16);
    return {
      date: cell.toISOString().slice(0, 10),
      time: time === "00:00" ? null : time,
    };
  }
  const [datePart = "", timePart] = text(cell).split(" ");
  const date = sheetDate(datePart);
  if (date == null) return "invalid";
  if (timePart == null) return { date, time: null };
  const time = /^(\d{1,2}):(\d{2})$/.exec(timePart);
  if (time == null || Number(time[1]) > 23 || Number(time[2]) > 59)
    return "invalid";
  return { date, time: `${pad(time[1] ?? "")}:${time[2] ?? ""}` };
}

const INTEREST_BY_WORD = new Map<string, InterestType>([
  ...INTEREST_TYPES.map((type) => [type, type] as const),
  ...INTEREST_TYPES.map(
    (type) => [key(INTEREST_TYPE_LABELS[type]), type] as const,
  ),
]);

function rowsError(errors: InquiryImportRowError[]): DomainError {
  const sorted = [...errors].sort(
    (a, b) => a.row - b.row || a.field.localeCompare(b.field),
  );
  return new DomainError(
    "IMPORT_HAS_ERRORS",
    `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
    { details: { errors: sorted } },
  );
}

/** The live names a sheet may use, for the sample's Lists sheet. */
export async function inquiryImportLists(
  deps: InquiryDeps,
  access: MemberAccess,
  projectId: string,
): Promise<InquiryImportLists> {
  assertCan(access, "sales.inquiries", "create", { projectId });
  const ws = access.workspaceId;
  const [sources, stages, wings, members] = await Promise.all([
    deps.lists.list(deps.db, ws, projectId, "lead_source"),
    deps.lists.list(deps.db, ws, projectId, "funnel_stage"),
    deps.directory.wings(deps.db, ws, projectId),
    deps.directory.membersOnProject(deps.db, ws, projectId),
  ]);
  return {
    leadSources: sources.filter((row) => row.isActive).map((row) => row.name),
    funnelStages: stages.map((row) => row.name),
    wings: wings.map((wing) => wing.name),
    members: members.map((member) => member.name),
  };
}

/**
 * Checks every row, then adds them all in one transaction with their
 * `created` history rows and one audit event. Any problem anywhere saves
 * nothing: 400 `IMPORT_HAS_ERRORS` with `details.errors` =
 * [{ row, field, message }]; 400 `IMPORT_EMPTY`, `IMPORT_TOO_MANY`.
 * A mobile or email another live inquiry of the Project — or another row
 * — already has is a row error unless `allowDuplicates`. The back-dated
 * `inquiry` window applies to each row's date. As on the form, the
 * importer is the Lead Owner and, when the row names none, the Assignee.
 * Needs Inquiry Create.
 */
export async function importInquiries(
  deps: InquiryDeps,
  access: MemberAccess,
  projectId: string,
  rows: readonly InquirySheetRow[],
  options: { allowDuplicates: boolean; now: Date },
): Promise<{ imported: number }> {
  assertCan(access, "sales.inquiries", "create", { projectId });
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > SALES_LIMITS.inquiryImportRows)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${SALES_LIMITS.inquiryImportRows.toLocaleString("en-IN")} rows at a time.`,
    );
  const { db, directory, lists, store } = deps;
  const ws = access.workspaceId;
  const [today, timeZone, sources, stages, wings, members, viewer, check] =
    await Promise.all([
      deps.today(ws),
      deps.timeZone(ws),
      lists.list(db, ws, projectId, "lead_source"),
      lists.list(db, ws, projectId, "funnel_stage"),
      directory.wings(db, ws, projectId),
      directory.membersOnProject(db, ws, projectId),
      directory.memberOfUser(db, ws, access.userId, projectId),
      deps.backdated(access),
    ]);
  const viewerMemberId =
    viewer != null && viewer.onProject && viewer.active ? viewer.id : null;
  const byName = <T extends { name: string }>(items: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items)
      map.set(key(item.name), [...(map.get(key(item.name)) ?? []), item]);
    return map;
  };
  const sourcesByName = byName(sources);
  const stagesByName = byName(stages);
  const wingsByName = byName(wings);
  const membersByName = byName(members);
  const membersByMobile = new Map<string, typeof members>();
  for (const member of members) {
    const mobile =
      member.mobile == null ? null : normaliseMobile(member.mobile);
    if (mobile != null)
      membersByMobile.set(mobile, [
        ...(membersByMobile.get(mobile) ?? []),
        member,
      ]);
  }

  const errors: InquiryImportRowError[] = [];
  const planned: { row: number; content: InquiryContent }[] = [];
  for (const { row, cells } of rows) {
    const fail = (column: InquiryImportColumnKey, message: string) => {
      errors.push({ row, field: HEADER_OF[column], message });
    };
    const before = errors.length;
    let date: CalendarDate | null = today;
    if (text(cells.inquiryDate) !== "") {
      date = sheetDate(cells.inquiryDate);
      if (date == null)
        fail("inquiryDate", "Write the date as YYYY-MM-DD or DD-MM-YYYY.");
    }
    const interestWord = key(text(cells.interestType));
    const interestType =
      interestWord === "" ? null : (INTEREST_BY_WORD.get(interestWord) ?? null);
    if (interestWord !== "" && interestType == null)
      fail("interestType", "Write Hot, Warm or Cold.");
    const next = sheetDateTime(cells.nextFollowUp);
    if (next === "invalid")
      fail(
        "nextFollowUp",
        "Write the date as YYYY-MM-DD or DD-MM-YYYY, with an optional HH:MM.",
      );
    const one = <T>(
      column: InquiryImportColumnKey,
      found: readonly T[] | undefined,
      words: string,
    ): T | null => {
      const value = text(cells[column]);
      if (value === "") return null;
      if (found == null || found.length === 0) {
        fail(column, `No ${words} of this Project is named “${value}”.`);
        return null;
      }
      if (found.length > 1) {
        fail(column, `More than one ${words} is named “${value}”.`);
        return null;
      }
      return found[0] ?? null;
    };
    const source = one(
      "leadSource",
      sourcesByName.get(key(text(cells.leadSource))),
      "Lead Source",
    );
    if (source != null && !source.isActive) {
      fail("leadSource", `The Lead Source “${source.name}” is disabled.`);
    }
    const stage = one(
      "stage",
      stagesByName.get(key(text(cells.stage))),
      "Funnel Stage",
    );
    const wing = one("wing", wingsByName.get(key(text(cells.wing))), "Wing");
    let assigneeMemberId = viewerMemberId;
    const assigneeWord = text(cells.assignee);
    if (assigneeWord !== "") {
      const mobile = normaliseMobile(assigneeWord);
      const found =
        (mobile == null ? undefined : membersByMobile.get(mobile)) ??
        membersByName.get(key(assigneeWord)) ??
        [];
      if (found.length === 0)
        fail(
          "assignee",
          `No Team Member on this Project is named “${assigneeWord}” or has that mobile.`,
        );
      else if (found.length > 1)
        fail(
          "assignee",
          `More than one Team Member matches “${assigneeWord}”. Use their mobile.`,
        );
      else assigneeMemberId = found[0]?.id ?? null;
    }
    let fields: ReturnType<typeof inquiryFields> | null = null;
    if (date != null)
      try {
        fields = inquiryFields(
          {
            inquiryDate: date,
            name: text(cells.name),
            mobile: text(cells.mobile),
            email: text(cells.email),
            address: text(cells.address),
            occupation: text(cells.occupation),
            interestType,
            interestedUnitType: text(cells.unitType),
            remarks: text(cells.remarks),
            nextFollowUp: next === "invalid" ? null : next,
          },
          today,
        );
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        const field = (error.details as { field?: string } | undefined)?.field;
        fail(COLUMN_OF_FIELD[field ?? ""] ?? "name", error.message);
      }
    if (fields != null)
      try {
        check("inquiry", "create", fields.inquiryDate);
      } catch (error) {
        if (!(error instanceof DomainError) || !BACKDATED_CODES.has(error.code))
          throw error;
        fail("inquiryDate", error.message);
      }
    if (fields == null || errors.length > before) continue;
    const stored = toStoredFollowUpAt(fields.nextFollowUp, timeZone);
    planned.push({
      row,
      content: {
        inquiryDate: fields.inquiryDate,
        name: fields.name,
        mobile: fields.mobile,
        email: fields.email,
        address: fields.address,
        occupation: fields.occupation,
        interestType: fields.interestType,
        interestedWingId: wing?.id ?? null,
        interestedUnitType: fields.interestedUnitType,
        leadSourceId: source?.id ?? null,
        funnelStageId: stage?.id ?? stages[0]?.id ?? null,
        nextFollowUpAt: stored?.at ?? null,
        nextFollowUpHasTime: stored?.hasTime ?? false,
        assigneeMemberId,
        leadOwnerMemberId: viewerMemberId,
        remarks: fields.remarks,
      },
    });
  }

  if (!options.allowDuplicates) {
    const existing = await store.existingKeys(
      db,
      ws,
      projectId,
      planned.flatMap(({ content }) =>
        content.mobile == null ? [] : [content.mobile],
      ),
      planned.flatMap(({ content }) =>
        content.email == null ? [] : [content.email],
      ),
    );
    const firstMobile = new Map<string, number>();
    const firstEmail = new Map<string, number>();
    for (const { row, content } of planned) {
      const fail = (column: InquiryImportColumnKey, message: string) => {
        errors.push({ row, field: HEADER_OF[column], message });
      };
      if (content.mobile != null) {
        const first = firstMobile.get(content.mobile);
        if (existing.mobiles.has(content.mobile))
          fail("mobile", "An inquiry of this Project already has this mobile.");
        else if (first != null)
          fail("mobile", `Row ${String(first)} has the same mobile.`);
        else firstMobile.set(content.mobile, row);
      }
      if (content.email != null) {
        const email = content.email.toLowerCase();
        const first = firstEmail.get(email);
        if (existing.emails.has(email))
          fail("email", "An inquiry of this Project already has this email.");
        else if (first != null)
          fail("email", `Row ${String(first)} has the same email.`);
        else firstEmail.set(email, row);
      }
    }
  }
  if (errors.length > 0) throw rowsError(errors);

  const at = options.now;
  const ids: string[] = [];
  await db.$transaction(async (tx) => {
    const events: NewInquiryEvent[] = [];
    for (const { content } of planned) {
      const id = newId(at.getTime());
      ids.push(id);
      await store.insert(tx, {
        ...content,
        id,
        workspaceId: ws,
        projectId,
        by: access.userId,
        at,
      });
      events.push({
        inquiryId: id,
        type: "created",
        details: {
          stageId: content.funnelStageId,
          assigneeMemberId: content.assigneeMemberId,
          leadOwnerMemberId: content.leadOwnerMemberId,
          imported: true,
        },
      });
    }
    await store.appendEvents(tx, ws, events, access.userId, at);
    await recordAudit(tx, {
      workspaceId: ws,
      actorUserId: access.userId,
      action: "inquiry.imported",
      entityType: "project",
      entityId: projectId,
      after: {
        inquiries: ids.length,
        inquiryIds: ids,
        allowDuplicates: options.allowDuplicates,
      },
      occurredAt: at,
    });
  });
  return { imported: ids.length };
}
