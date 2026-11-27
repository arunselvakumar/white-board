import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  CheckInActivityRow,
  LabourActivitySource,
  ProjectActivityWindow,
  ProjectLabourMoveRow,
} from "@/src/labour/application/labour-activity-ports";
import { PrismaLabourActivity } from "@/src/labour/infrastructure/prisma-labour-activity";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  ACTIVITY_PAGE_SIZE,
  decodeActivityCursor,
  encodeActivityCursor,
  mergeActivity,
} from "@/src/shared-kernel/activity-key";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import {
  activityCheckIn,
  CHECK_IN_MENU,
  companyActorNames,
  resolveProjects,
  type ActivityCheckIn,
  type ActivityPage,
  type ActivityProject,
  type ActorNames,
  type ProjectNames,
} from "./labour-activity";

/** Opens an Employee's page (the Employees menu, key `masters.labours`). */
const PEOPLE_MENU = "masters.labours";
/** Opens a Vendor's page. */
const VENDORS_MENU = "masters.vendors";

type CheckInPersonKind = CheckInActivityRow["person"]["kind"];

/** Shown for a person whose row is gone. */
const DELETED_PERSON: Record<CheckInPersonKind, string> = {
  employee: "Deleted Employee",
  vendor: "Deleted Vendor",
};

/** Who a check-in entry names (ADR CM-0044 §2). */
export type ActivityCheckInPerson = {
  kind: CheckInPersonKind;
  id: string;
  name: string;
  /** An Employee's Role name, or "Vendor". */
  role: string | null;
  /** The viewer may open their page, and they were not deleted. */
  canOpen: boolean;
};

export type ActivityEmployeePerson = {
  id: string;
  name: string;
  employeeCode: string | null;
  /** The Employee's Role name (ADR CM-0055 §5). */
  role: string | null;
  /** The viewer may open their page, and they were not deleted. */
  canOpen: boolean;
};

type EntryBase = {
  id: string;
  date: CalendarDate;
  recordedAt: Date;
  by: string | null;
};

export type ProjectActivityEntry = EntryBase &
  (
    | {
        kind: "employee_added" | "employee_removed";
        employees: ActivityEmployeePerson[];
        remark: string | null;
      }
    | {
        kind: "transferred_in";
        employees: ActivityEmployeePerson[];
        fromProject: ActivityProject | null;
        remark: string | null;
      }
    | {
        kind: "transferred_out";
        employees: ActivityEmployeePerson[];
        toProject: ActivityProject | null;
        remark: string | null;
      }
    | ({ kind: "check_in"; person: ActivityCheckInPerson } & ActivityCheckIn)
  );

export const PROJECT_ACTIVITY_WHO = ["all", "employees", "vendors"] as const;
export type ProjectActivityWho = (typeof PROJECT_ACTIVITY_WHO)[number];

/** Team changes: added, removed, transferred (ADR CM-0044 §5). */
export const PROJECT_ACTIVITY_TYPES = ["all", "team", "check_ins"] as const;
export type ProjectActivityType = (typeof PROJECT_ACTIVITY_TYPES)[number];

/** Whose check-in entries each Who reads. */
const CHECK_IN_KINDS: Record<ProjectActivityWho, CheckInPersonKind[]> = {
  all: ["employee", "vendor"],
  employees: ["employee"],
  vendors: ["vendor"],
};

export type ProjectActivityFilter = {
  type: ProjectActivityType;
  who: ProjectActivityWho;
  from: CalendarDate | null;
  to: CalendarDate | null;
  cursor: string | null;
};

type Row = ProjectLabourMoveRow | CheckInActivityRow;

/**
 * A Project's Activity feed (ADR CM-0038 §1, §4, CM-0055): Employees
 * added, removed and transferred in or out (labour context, a batch as one
 * entry; an Employee who signs in has the same Projects, so their sign-in
 * adds nothing), and everyone's check-in entries, one each (labour
 * context, ADR CM-0044), only with Attendance Read on the Project. The
 * viewer must be on the Project; the day's attendance status is not in
 * this feed.
 */
export class ProjectActivityService {
  constructor(
    private readonly assertVisible: (
      viewer: ProjectViewer,
      projectId: string,
    ) => Promise<void>,
    private readonly labour: LabourActivitySource,
    private readonly projectNames: ProjectNames,
    private readonly actorNames: ActorNames,
    private readonly timeZoneOf: (workspaceId: string) => Promise<string>,
  ) {}

  /** 404 `PROJECT_NOT_FOUND` for another Company's Project or one the Member is not on. */
  async feed(
    access: MemberAccess,
    projectId: string,
    filter: ProjectActivityFilter,
  ): Promise<ActivityPage<ProjectActivityEntry>> {
    await this.assertVisible(access, projectId);
    const { workspaceId } = access;
    const timeZone = await this.timeZoneOf(workspaceId);
    const window: ProjectActivityWindow = {
      workspaceId,
      projectId,
      before:
        filter.cursor == null ? null : decodeActivityCursor(filter.cursor),
      limit: ACTIVITY_PAGE_SIZE + 1,
      from: filter.from,
      to: filter.to,
    };
    const team = filter.type !== "check_ins";
    const checkIns =
      filter.type !== "team" &&
      can(access, CHECK_IN_MENU, "read", { projectId });
    const [moves, entries] = await Promise.all([
      team && (filter.who === "all" || filter.who === "employees")
        ? this.labour.projectMoves(window)
        : Promise.resolve([]),
      checkIns
        ? this.labour.projectCheckIns({
            ...window,
            kinds: CHECK_IN_KINDS[filter.who],
          })
        : Promise.resolve([]),
    ]);
    const page = mergeActivity<Row>([moves, entries]);

    const employeeIds = page.items.flatMap((row) =>
      "employeeIds" in row ? row.employeeIds : [],
    );
    const [employees, checkInPeople, project, names] = await Promise.all([
      this.labour.employees(workspaceId, employeeIds),
      this.labour.checkInPeople(
        workspaceId,
        page.items.flatMap((row) =>
          row.kind === "check_in" ? [row.person] : [],
        ),
      ),
      resolveProjects(
        this.projectNames,
        access,
        page.items.map((row) =>
          "otherProjectId" in row ? row.otherProjectId : null,
        ),
      ),
      this.actorNames(
        workspaceId,
        page.items.map((row) => row.by),
      ),
    ]);
    const mayOpenPeople = can(access, PEOPLE_MENU, "read");
    const mayOpen: Record<CheckInPersonKind, boolean> = {
      employee: mayOpenPeople,
      vendor: can(access, VENDORS_MENU, "read"),
    };
    const checkInPerson = (
      ref: CheckInActivityRow["person"],
    ): ActivityCheckInPerson => {
      const found = checkInPeople.get(`${ref.kind}:${ref.id}`);
      return {
        kind: ref.kind,
        id: ref.id,
        name: found?.name ?? DELETED_PERSON[ref.kind],
        role: found?.role ?? null,
        canOpen: mayOpen[ref.kind] && found != null && !found.deleted,
      };
    };
    const person = (id: string): ActivityEmployeePerson => {
      const found = employees.get(id);
      return {
        id,
        name: found?.name ?? DELETED_PERSON.employee,
        employeeCode: found?.employeeCode ?? null,
        role: found?.role ?? null,
        canOpen: mayOpenPeople && found != null && !found.deleted,
      };
    };
    const byName = (a: ActivityEmployeePerson, b: ActivityEmployeePerson) =>
      a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);

    return {
      items: page.items.map((row): ProjectActivityEntry => {
        const base = {
          id: `${row.kind}:${row.key.id}`,
          date: row.key.date,
          recordedAt: row.key.recordedAt,
          by: names.get(row.by) ?? null,
        };
        if (row.kind === "check_in")
          return {
            ...base,
            kind: row.kind,
            person: checkInPerson(row.person),
            ...activityCheckIn(row),
          };
        const people = row.employeeIds.map(person).sort(byName);
        const other =
          row.otherProjectId == null ? null : project(row.otherProjectId);
        switch (row.kind) {
          case "transferred_in":
            return {
              ...base,
              kind: row.kind,
              employees: people,
              fromProject: other,
              remark: row.remark,
            };
          case "transferred_out":
            return {
              ...base,
              kind: row.kind,
              employees: people,
              toProject: other,
              remark: row.remark,
            };
          default:
            return {
              ...base,
              kind: row.kind,
              employees: people,
              remark: row.remark,
            };
        }
      }),
      nextCursor: page.next == null ? null : encodeActivityCursor(page.next),
      timeZone,
    };
  }
}

/** The Prisma-backed composition the route uses. */
export function createProjectActivity(deps?: {
  prisma?: PrismaClient;
}): ProjectActivityService {
  const db = deps?.prisma ?? prisma;
  const projects = new PrismaProjectRepository(db);
  return new ProjectActivityService(
    async (viewer, projectId) => {
      await loadVisibleProject(projects, viewer, projectId);
    },
    new PrismaLabourActivity(db),
    (workspaceId, ids) => projectNames(workspaceId, ids, db),
    companyActorNames(db),
    (workspaceId) => companyTimezone(db, workspaceId),
  );
}
