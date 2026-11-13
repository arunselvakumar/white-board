import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import {
  INTEREST_LABELS,
  STAGE_LABELS,
  STAGES,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUS_LABELS,
  type Stage,
} from "@/src/marketing/domain/marketing-terms";
import {
  latestValue,
  lastCompletedVisitAt,
  nextOpenDue,
  openAt,
  personSummary,
  stageOn,
  visitRegister,
  type ReportRecordScope,
} from "@/src/marketing/domain/report-rows";
import { monthBounds } from "@/src/marketing/domain/team";
import { followUpVisibleWhere } from "@/src/marketing/infrastructure/prisma-follow-up-store";
import { prospectCompanyVisibleWhere } from "@/src/marketing/infrastructure/prisma-prospect-company-store";
import { visitVisibleWhere } from "@/src/marketing/infrastructure/prisma-visit-store";
import type { MarketingReportSource } from "@/src/reporting/application/ports";
import type { MarketingRecordScope } from "@/src/reporting/domain/report-job";
import {
  addDays,
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { zoneInstant, zoneParts } from "@/src/shared-kernel/zone-time";

import { marketingTeam } from "./marketing-team";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as "13 Nov 2026, 10:30" on the Company's clock. */
function whenWords(instant: Date, timeZone: string): string {
  const p = zoneParts(instant, timeZone);
  return `${pad(p.day)} ${MONTHS[p.month - 1] ?? ""} ${String(p.year)}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** An instant's calendar date on the Company's clock. */
function dateIn(instant: Date, timeZone: string): CalendarDate {
  const p = zoneParts(instant, timeZone);
  return `${String(p.year)}-${pad(p.month)}-${pad(p.day)}`;
}

/** No record at all: a scope without Read. */
const NOTHING = { id: { in: [] as string[] } };

function visitWhere(
  scope: MarketingRecordScope,
): Prisma.ConstructionMarketingVisitWhereInput {
  if (scope === "none") return NOTHING;
  return visitVisibleWhere(scope === "all" ? null : scope);
}

function companyWhere(
  scope: MarketingRecordScope,
): Prisma.ConstructionMarketingProspectCompanyWhereInput {
  if (scope === "none") return NOTHING;
  return prospectCompanyVisibleWhere(scope === "all" ? null : scope);
}

function followUpWhere(
  scope: MarketingRecordScope,
): Prisma.ConstructionMarketingFollowUpWhereInput {
  if (scope === "none") return NOTHING;
  return followUpVisibleWhere(scope === "all" ? null : scope);
}

/** The job's scope as marketing's rules take it. */
const recordScope = (scope: MarketingRecordScope): ReportRecordScope => scope;

function counts(
  rows: readonly { id: string | null; count: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows)
    if (row.id != null) map.set(row.id, (map.get(row.id) ?? 0) + row.count);
  return map;
}

/**
 * The Marketing reports' read model (ADR CM-0040 §13): the marketing
 * tables through marketing's own `where`s for the requester's scope (§5)
 * and its rules (`report-rows.ts`), with Marketing People's names from the
 * organization (`marketingTeam`). Lives in composition because it crosses
 * contexts, as the sales reports' source does.
 */
export function createMarketingReportSource(
  db: PrismaClient = prisma,
): MarketingReportSource {
  return {
    async visitRegister(workspaceId, filter) {
      const timeZone = await companyTimezone(db, workspaceId);
      const rows = await db.constructionMarketingVisit.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          visitAt: {
            gte: zoneInstant(filter.range.from, 0, timeZone),
            lt: zoneInstant(addDays(filter.range.to, 1), 0, timeZone),
          },
          ...(filter.memberId == null
            ? {}
            : { visitors: { some: { memberId: filter.memberId } } }),
          ...(filter.prospectCompanyId == null
            ? {}
            : { prospectCompanyId: filter.prospectCompanyId }),
          ...(filter.purpose == null ? {} : { purpose: filter.purpose }),
          AND: [visitWhere(filter.scopes.visits)],
        },
        select: {
          id: true,
          number: true,
          visitAt: true,
          status: true,
          purpose: true,
          discussion: true,
          outcome: true,
          interest: true,
          requirementValue: true,
          checkInAt: true,
          createdBy: true,
          prospectCompany: { select: { name: true, city: true } },
          visitors: {
            select: { memberId: true },
            orderBy: { memberId: "asc" },
          },
          contacts: { select: { contact: { select: { name: true } } } },
        },
      });
      const visits = visitRegister(
        rows.map((row) => ({
          ...row,
          checkedIn: row.checkInAt != null,
          visitorIds: row.visitors.map((item) => item.memberId),
        })),
        {
          scope: recordScope(filter.scopes.visits),
          now: filter.now,
          status: filter.status,
        },
      );
      const ids = visits.map((visit) => visit.id);
      const [followUps, names, company] = await Promise.all([
        ids.length === 0
          ? Promise.resolve([])
          : db.constructionMarketingFollowUp.findMany({
              where: {
                workspaceId,
                visitId: { in: ids },
                status: "open",
                deletedAt: null,
                prospectCompany: { deletedAt: null },
                AND: [followUpWhere(filter.scopes.followUps)],
              },
              select: { visitId: true, status: true, dueDate: true },
            }),
        marketingTeam.memberNames(workspaceId, [
          ...visits.flatMap((visit) => visit.visitorIds),
          ...(filter.memberId == null ? [] : [filter.memberId]),
        ]),
        // The picked company's name, only when the requester may see it.
        filter.prospectCompanyId == null
          ? Promise.resolve(null)
          : db.constructionMarketingProspectCompany.findFirst({
              where: {
                workspaceId,
                id: filter.prospectCompanyId,
                AND: [companyWhere(filter.scopes.companies)],
              },
              select: { name: true },
            }),
      ]);
      const byVisit = new Map<
        string,
        { status: "open"; dueDate: CalendarDate }[]
      >();
      for (const row of followUps) {
        if (row.visitId == null) continue;
        const list = byVisit.get(row.visitId) ?? [];
        list.push({ status: "open", dueDate: calendarDateFromDb(row.dueDate) });
        byVisit.set(row.visitId, list);
      }
      // Else from a Visit of it the requester sees.
      const companyName = company?.name ?? rows[0]?.prospectCompany.name;
      const filterNames = [
        ...(filter.memberId == null
          ? []
          : [
              `Visited by: ${names.get(filter.memberId) ?? "a former member"}.`,
            ]),
        ...(filter.prospectCompanyId == null
          ? []
          : [`Prospect Company: ${companyName ?? "one you cannot open"}.`]),
        ...(filter.status == null
          ? []
          : [`Status: ${VISIT_STATUS_LABELS[filter.status]}.`]),
        ...(filter.purpose == null
          ? []
          : [`Purpose: ${VISIT_PURPOSE_LABELS[filter.purpose]}.`]),
      ];
      return {
        filterNames,
        rows: visits.map((visit) => {
          const contacts = visit.contacts.map((item) => item.contact.name);
          const discussion = [
            visit.discussion,
            visit.outcome == null ? null : `Outcome: ${visit.outcome}`,
          ].filter((part): part is string => part != null && part !== "");
          return {
            number: visit.number,
            when: whenWords(visit.visitAt, timeZone),
            company: visit.prospectCompany.name,
            city: visit.prospectCompany.city,
            contacts: contacts.length === 0 ? null : contacts.join(", "),
            visitedBy: visit.visitorIds
              .map((id) => names.get(id) ?? "Removed member")
              .join(", "),
            purpose:
              visit.purpose == null
                ? null
                : VISIT_PURPOSE_LABELS[visit.purpose],
            status: VISIT_STATUS_LABELS[visit.shown],
            discussion: discussion.length === 0 ? null : discussion.join(" "),
            interest:
              visit.interest == null ? null : INTEREST_LABELS[visit.interest],
            value:
              visit.requirementValue == null
                ? null
                : Number(visit.requirementValue),
            nextFollowUp: nextOpenDue(byVisit.get(visit.id) ?? []),
            checkedIn: visit.checkedIn,
          };
        }),
      };
    },

    async personSummary(workspaceId, filter) {
      const timeZone = await companyTimezone(db, workspaceId);
      const today = todayIn(timeZone, filter.now);
      const { first, next } = monthBounds(filter.month);
      const from = zoneInstant(first, 0, timeZone);
      const to = zoneInstant(next, 0, timeZone);
      const missedTo = filter.now < to ? filter.now : to;
      const overdueTo = today < next ? today : next;
      const liveCompany = { prospectCompany: { deletedAt: null } } as const;
      const [people, completed, missed, created, done, overdue, won] =
        await Promise.all([
          marketingTeam.people(workspaceId),
          db.$queryRaw<{ id: string; count: bigint }[]>(Prisma.sql`
            SELECT vv.member_id AS id, count(*) AS count
            FROM construction_marketing.visit_visitors vv
            JOIN construction_marketing.visits v ON v.id = vv.visit_id
            WHERE v.workspace_id = ${workspaceId}
              AND v.deleted_at IS NULL
              AND v.status = 'completed'
              AND v.visit_at >= ${from}
              AND v.visit_at < ${to}
            GROUP BY vv.member_id`),
          // Missed (ADR CM-0040 §7): Planned, its time passed, not checked in.
          missedTo <= from
            ? Promise.resolve([])
            : db.$queryRaw<{ id: string; count: bigint }[]>(Prisma.sql`
                SELECT vv.member_id AS id, count(*) AS count
                FROM construction_marketing.visit_visitors vv
                JOIN construction_marketing.visits v ON v.id = vv.visit_id
                WHERE v.workspace_id = ${workspaceId}
                  AND v.deleted_at IS NULL
                  AND v.status = 'planned'
                  AND v.check_in_at IS NULL
                  AND v.visit_at >= ${from}
                  AND v.visit_at < ${missedTo}
                GROUP BY vv.member_id`),
          db.constructionMarketingProspectCompany.groupBy({
            by: ["assignedMemberId"],
            where: {
              workspaceId,
              deletedAt: null,
              createdAt: { gte: from, lt: to },
            },
            _count: { _all: true },
          }),
          db.constructionMarketingFollowUp.groupBy({
            by: ["ownerMemberId"],
            where: {
              workspaceId,
              deletedAt: null,
              status: "done",
              doneOn: {
                gte: calendarDateToDb(first),
                lt: calendarDateToDb(next),
              },
              ...liveCompany,
            },
            _count: { _all: true },
          }),
          overdueTo <= first
            ? Promise.resolve([])
            : db.constructionMarketingFollowUp.groupBy({
                by: ["ownerMemberId"],
                where: {
                  workspaceId,
                  deletedAt: null,
                  status: "open",
                  dueDate: {
                    gte: calendarDateToDb(first),
                    lt: calendarDateToDb(overdueTo),
                  },
                  ...liveCompany,
                },
                _count: { _all: true },
              }),
          // One row per company: moved to Won twice in the month counts once.
          db.constructionMarketingStageChange.findMany({
            where: {
              workspaceId,
              toStage: "won",
              changedAt: { gte: from, lt: to },
              prospectCompany: { deletedAt: null },
            },
            distinct: ["prospectCompanyId"],
            select: { prospectCompany: { select: { assignedMemberId: true } } },
          }),
        ]);
      const scope = filter.scopes.visits;
      const onlyMemberId =
        scope === "all" ? undefined : scope === "none" ? null : scope.memberId;
      const raw = (rows: { id: string; count: bigint }[]) =>
        counts(rows.map((row) => ({ id: row.id, count: Number(row.count) })));
      const figures = {
        completed: raw(completed),
        missed: raw(missed),
        newCompanies: counts(
          created.map((row) => ({
            id: row.assignedMemberId,
            count: row._count._all,
          })),
        ),
        followUpsDone: counts(
          done.map((row) => ({
            id: row.ownerMemberId,
            count: row._count._all,
          })),
        ),
        followUpsOverdue: counts(
          overdue.map((row) => ({
            id: row.ownerMemberId,
            count: row._count._all,
          })),
        ),
        won: counts(
          won.map((row) => ({
            id: row.prospectCompany.assignedMemberId,
            count: 1,
          })),
        ),
      };
      const known = new Set(people.map((person) => person.id));
      const others = [
        ...Object.values(figures).flatMap((map) => [...map.keys()]),
        ...(onlyMemberId == null ? [] : [onlyMemberId]),
      ].filter((id) => !known.has(id));
      const ids = [...known, ...others];
      const [otherNames, targets] = await Promise.all([
        marketingTeam.memberNames(workspaceId, others),
        ids.length === 0
          ? Promise.resolve([])
          : db.constructionMarketingVisitTarget.findMany({
              where: { workspaceId, memberId: { in: ids } },
              select: { memberId: true, effectiveMonth: true, target: true },
            }),
      ]);
      return personSummary({
        month: filter.month,
        people,
        otherNames,
        figures,
        targets: targets.map((row) => ({
          memberId: row.memberId,
          effectiveMonth: calendarDateFromDb(row.effectiveMonth).slice(0, 7),
          target: row.target,
        })),
        onlyMemberId,
      });
    },

    async companyPipeline(workspaceId, filter) {
      const timeZone = await companyTimezone(db, workspaceId);
      const until = zoneInstant(addDays(filter.asOn, 1), 0, timeZone);
      const companies = await db.constructionMarketingProspectCompany.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          createdAt: { lt: until },
          ...(filter.memberId == null
            ? {}
            : { assignedMemberId: filter.memberId }),
          AND: [companyWhere(filter.scopes.companies)],
        },
        orderBy: [{ nameKey: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          city: true,
          stage: true,
          assignedMemberId: true,
          stageChanges: {
            where: { changedAt: { lt: until } },
            select: { toStage: true, changedAt: true },
          },
        },
      });
      const ids = companies.map((company) => company.id);
      const [visits, followUps, names] = await Promise.all([
        ids.length === 0
          ? Promise.resolve([])
          : db.constructionMarketingVisit.findMany({
              where: {
                workspaceId,
                prospectCompanyId: { in: ids },
                deletedAt: null,
                visitAt: { lt: until },
                AND: [visitWhere(filter.scopes.visits)],
              },
              select: {
                prospectCompanyId: true,
                visitAt: true,
                status: true,
                requirementValue: true,
              },
            }),
        ids.length === 0
          ? Promise.resolve([])
          : db.constructionMarketingFollowUp.findMany({
              where: {
                workspaceId,
                prospectCompanyId: { in: ids },
                deletedAt: null,
                createdAt: { lt: until },
                AND: [followUpWhere(filter.scopes.followUps)],
              },
              select: {
                prospectCompanyId: true,
                status: true,
                dueDate: true,
                createdAt: true,
                doneAt: true,
                cancelledAt: true,
              },
            }),
        marketingTeam.memberNames(workspaceId, [
          ...companies.flatMap((company) =>
            company.assignedMemberId == null ? [] : [company.assignedMemberId],
          ),
          ...(filter.memberId == null ? [] : [filter.memberId]),
        ]),
      ]);
      const group = <T extends { prospectCompanyId: string }>(
        rows: readonly T[],
      ) => {
        const map = new Map<string, T[]>();
        for (const row of rows) {
          const list = map.get(row.prospectCompanyId) ?? [];
          list.push(row);
          map.set(row.prospectCompanyId, list);
        }
        return map;
      };
      const visitsOf = group(
        visits.map((visit) => ({
          prospectCompanyId: visit.prospectCompanyId,
          visitAt: visit.visitAt,
          status: visit.status,
          value:
            visit.requirementValue == null
              ? null
              : Number(visit.requirementValue),
        })),
      );
      const followUpsOf = group(followUps);
      const order = (stage: Stage) => STAGES.indexOf(stage);
      const rows = companies
        .map((company) => {
          const companyVisits = visitsOf.get(company.id) ?? [];
          const last = lastCompletedVisitAt(companyVisits, until);
          const open = (followUpsOf.get(company.id) ?? []).flatMap((row) =>
            openAt(row, until)
              ? [
                  {
                    status: "open" as const,
                    dueDate: calendarDateFromDb(row.dueDate),
                  },
                ]
              : [],
          );
          return {
            name: company.name,
            stage: stageOn(company.stageChanges, until, company.stage),
            assignedMemberId: company.assignedMemberId,
            city: company.city,
            lastVisit: last == null ? null : dateIn(last, timeZone),
            nextFollowUp: nextOpenDue(open),
            value: latestValue(companyVisits, until),
          };
        })
        .filter((row) => filter.stage == null || row.stage === filter.stage)
        .sort((a, b) => order(a.stage) - order(b.stage));
      const filterNames = [
        ...(filter.stage == null
          ? []
          : [`Stage: ${STAGE_LABELS[filter.stage]}.`]),
        ...(filter.memberId == null
          ? []
          : [
              `Assigned to: ${names.get(filter.memberId) ?? "a former member"}.`,
            ]),
      ];
      return {
        filterNames,
        stages: (filter.stage == null ? STAGES : [filter.stage]).map(
          (stage) => STAGE_LABELS[stage],
        ),
        rows: rows.map((row) => ({
          company: row.name,
          stage: STAGE_LABELS[row.stage],
          assignedTo:
            row.assignedMemberId == null
              ? null
              : (names.get(row.assignedMemberId) ?? "Removed member"),
          city: row.city,
          lastVisit: row.lastVisit,
          nextFollowUp: row.nextFollowUp,
          value: row.value,
        })),
      };
    },
  };
}
