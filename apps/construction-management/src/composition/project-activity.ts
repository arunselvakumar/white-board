import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  LabourActivitySource,
  ProjectActivityWindow,
  ProjectLabourMoveRow,
} from "@/src/labour/application/labour-activity-ports";
import { PrismaLabourActivity } from "@/src/labour/infrastructure/prisma-labour-activity";
import {
  siteEngineerSignInLinks,
  type SiteEngineerSignInLink,
} from "@/src/masters/infrastructure/prisma-site-engineer-sign-ins";
import type { SignInProjectHistory } from "@/src/organization/application/sign-in-project-history";
import { PrismaSignInProjectHistory } from "@/src/organization/infrastructure/prisma-sign-in-project-history";
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
  pageAfter,
  type ActivityKey,
} from "@/src/shared-kernel/activity-key";
import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";

import {
  companyActorNames,
  resolveProjects,
  type ActivityPage,
  type ActivityProject,
  type ActorNames,
  type ProjectNames,
} from "./labour-activity";

/** Site Engineer entries rank above the Labour ones on the same time. */
const SITE_ENGINEER_RANK = { added: 6, removed: 7 } as const;

/** Opens the Labour and Site Engineer pages (both under the Labours menu). */
const PEOPLE_MENU = "masters.labours";

export type ActivityLabourPerson = {
  id: string;
  name: string;
  labourCode: string | null;
  labourCategory: string | null;
  /** The viewer may open their page, and they were not deleted. */
  canOpen: boolean;
};

export type ActivitySiteEngineer = {
  /** The Site Engineer; null when no Site Engineer points at the sign-in. */
  id: string | null;
  name: string;
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
        kind: "labour_added" | "labour_removed";
        labours: ActivityLabourPerson[];
        remark: string | null;
      }
    | {
        kind: "transferred_in";
        labours: ActivityLabourPerson[];
        fromProject: ActivityProject | null;
        remark: string | null;
      }
    | {
        kind: "transferred_out";
        labours: ActivityLabourPerson[];
        toProject: ActivityProject | null;
        remark: string | null;
      }
    | {
        kind: "site_engineer_added" | "site_engineer_removed";
        siteEngineer: ActivitySiteEngineer;
      }
  );

export const PROJECT_ACTIVITY_WHO = [
  "all",
  "site_engineers",
  "labours",
] as const;
export type ProjectActivityWho = (typeof PROJECT_ACTIVITY_WHO)[number];

export type ProjectActivityFilter = {
  who: ProjectActivityWho;
  from: CalendarDate | null;
  to: CalendarDate | null;
  cursor: string | null;
};

type SiteEngineerRow = {
  key: ActivityKey;
  kind: "site_engineer_added" | "site_engineer_removed";
  memberId: string;
  by: string;
};

type Row = ProjectLabourMoveRow | SiteEngineerRow;

/** Where Site Engineers' sign-ins are found, and who they are (masters). */
export type SiteEngineerLinks = (
  workspaceId: string,
) => Promise<SiteEngineerSignInLink[]>;

/**
 * A Project's Activity feed (ADR CM-0038 §1, §4): Labours added, removed
 * and transferred in or out (labour context, a batch as one entry), and
 * Site Engineers added or removed (their sign-in's history in the
 * organization context, named by the masters context). The viewer must be
 * on the Project; attendance is not in this feed.
 */
export class ProjectActivityService {
  constructor(
    private readonly assertVisible: (
      viewer: ProjectViewer,
      projectId: string,
    ) => Promise<void>,
    private readonly labour: LabourActivitySource,
    private readonly signIns: SignInProjectHistory,
    private readonly siteEngineers: SiteEngineerLinks,
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
    const [moves, engineers] = await Promise.all([
      filter.who === "site_engineers"
        ? Promise.resolve([])
        : this.labour.projectMoves(window),
      filter.who === "labours"
        ? Promise.resolve({
            rows: [],
            people: new Map<string, ActivitySiteEngineerSource>(),
          })
        : this.siteEngineerRows(window, timeZone),
    ]);
    const page = mergeActivity<Row>([moves, engineers.rows]);

    const labourIds = page.items.flatMap((row) =>
      "labourIds" in row ? row.labourIds : [],
    );
    const [labours, project, names] = await Promise.all([
      this.labour.labours(workspaceId, labourIds),
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
    const person = (id: string): ActivityLabourPerson => {
      const found = labours.get(id);
      return {
        id,
        name: found?.name ?? "Deleted Labour",
        labourCode: found?.labourCode ?? null,
        labourCategory: found?.labourCategory ?? null,
        canOpen: mayOpenPeople && found != null && !found.deleted,
      };
    };
    const byName = (a: ActivityLabourPerson, b: ActivityLabourPerson) =>
      a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);

    return {
      items: page.items.map((row): ProjectActivityEntry => {
        const base = {
          id: `${row.kind}:${row.key.id}`,
          date: row.key.date,
          recordedAt: row.key.recordedAt,
          by: names.get(row.by) ?? null,
        };
        if ("memberId" in row) {
          const found = engineers.people.get(row.memberId);
          return {
            ...base,
            kind: row.kind,
            siteEngineer: {
              id: found?.siteEngineerId ?? null,
              name: found?.name ?? "Site Engineer",
              canOpen:
                mayOpenPeople &&
                found?.siteEngineerId != null &&
                !found.deleted,
            },
          };
        }
        const people = row.labourIds.map(person).sort(byName);
        const other =
          row.otherProjectId == null ? null : project(row.otherProjectId);
        switch (row.kind) {
          case "transferred_in":
            return {
              ...base,
              kind: row.kind,
              labours: people,
              fromProject: other,
              remark: row.remark,
            };
          case "transferred_out":
            return {
              ...base,
              kind: row.kind,
              labours: people,
              toProject: other,
              remark: row.remark,
            };
          default:
            return {
              ...base,
              kind: row.kind,
              labours: people,
              remark: row.remark,
            };
        }
      }),
      nextCursor: page.next == null ? null : encodeActivityCursor(page.next),
      timeZone,
    };
  }

  /**
   * Site Engineers put on or taken off the Project, dated the day it was
   * recorded in the Company's time zone. A sign-in counts when a Site
   * Engineer (live or deleted) points at it or it is marked Site Engineer.
   */
  private async siteEngineerRows(
    window: ProjectActivityWindow,
    timeZone: string,
  ): Promise<{
    rows: SiteEngineerRow[];
    people: Map<string, ActivitySiteEngineerSource>;
  }> {
    const [links, signIns] = await Promise.all([
      this.siteEngineers(window.workspaceId),
      this.signIns.siteEngineerSignIns(window.workspaceId),
    ]);
    const people = new Map<string, ActivitySiteEngineerSource>();
    for (const signIn of signIns)
      people.set(signIn.id, {
        siteEngineerId: null,
        name: signIn.name,
        deleted: false,
      });
    // A live Site Engineer wins over a deleted one pointing at the same sign-in.
    for (const link of links) {
      const known = people.get(link.teamMemberId);
      if (known?.siteEngineerId != null && !known.deleted) continue;
      people.set(link.teamMemberId, {
        siteEngineerId: link.id,
        name: link.name,
        deleted: link.deleted,
      });
    }
    const changes = await this.signIns.projectChanges(
      window.workspaceId,
      [...people.keys()],
      window.projectId,
    );
    const rows = changes
      .map((change): SiteEngineerRow => ({
        key: {
          date: todayIn(timeZone, change.occurredAt),
          recordedAt: change.occurredAt,
          rank: SITE_ENGINEER_RANK[change.change],
          id: change.eventId,
        },
        kind:
          change.change === "added"
            ? "site_engineer_added"
            : "site_engineer_removed",
        memberId: change.memberId,
        by: change.by,
      }))
      .filter(
        (row) =>
          (window.from == null || row.key.date >= window.from) &&
          (window.to == null || row.key.date <= window.to),
      );
    return { rows: pageAfter(rows, window.before, window.limit), people };
  }
}

type ActivitySiteEngineerSource = {
  siteEngineerId: string | null;
  name: string;
  deleted: boolean;
};

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
    new PrismaSignInProjectHistory(db),
    (workspaceId) => siteEngineerSignInLinks(workspaceId, db),
    (workspaceId, ids) => projectNames(workspaceId, ids, db),
    companyActorNames(db),
    (workspaceId) => companyTimezone(db, workspaceId),
  );
}
