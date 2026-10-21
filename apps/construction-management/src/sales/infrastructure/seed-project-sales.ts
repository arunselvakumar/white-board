import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import seeds from "./seeds/project-sales.json";

/** The lists every Project starts with (ADR CM-0022 §2). */
export const SEED_FUNNEL_STAGES: readonly string[] = seeds.funnelStages;
export const SEED_LEAD_SOURCES: readonly string[] = seeds.leadSources;
export const SEED_LOST_REASONS: readonly string[] = seeds.lostReasons;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

type SeedInput = {
  workspaceId: string;
  projectId: string;
  by: string;
  now?: Date;
};

function missing(
  names: readonly string[],
  rows: readonly { name: string }[],
): string[] {
  const taken = new Set(rows.map((row) => row.name.toLowerCase()));
  return names.filter((name) => !taken.has(name.toLowerCase()));
}

/**
 * Copies the seed Funnel Stages, Lead Sources and Lost Reasons to a Project.
 * Idempotent: names the Project already has (live, any case) are skipped, so
 * running it twice, or after the M10 backfill migration, adds nothing. New
 * stages go after the Project's existing ones.
 */
export async function seedProjectSales(
  db: PrismaClient,
  input: SeedInput,
): Promise<void> {
  const now = input.now ?? new Date();
  const scope = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    deletedAt: null,
  };
  const stamp = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    isSeed: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.by,
    updatedBy: input.by,
  };
  await db.$transaction(async (tx: Tx) => {
    const stages = await tx.constructionSalesFunnelStage.findMany({
      where: scope,
      select: { name: true, sortOrder: true },
    });
    const last = stages.reduce((max, s) => Math.max(max, s.sortOrder), 0);
    const newStages = missing(SEED_FUNNEL_STAGES, stages);
    if (newStages.length > 0)
      await tx.constructionSalesFunnelStage.createMany({
        data: newStages.map((name, i) => ({
          ...stamp,
          id: newId(now.getTime()),
          name,
          sortOrder: last + i + 1,
        })),
      });

    const sources = missing(
      SEED_LEAD_SOURCES,
      await tx.constructionSalesLeadSource.findMany({
        where: scope,
        select: { name: true },
      }),
    );
    if (sources.length > 0)
      await tx.constructionSalesLeadSource.createMany({
        data: sources.map((name) => ({
          ...stamp,
          id: newId(now.getTime()),
          name,
        })),
      });

    const reasons = missing(
      SEED_LOST_REASONS,
      await tx.constructionSalesLostReason.findMany({
        where: scope,
        select: { name: true },
      }),
    );
    if (reasons.length > 0)
      await tx.constructionSalesLostReason.createMany({
        data: reasons.map((name) => ({
          ...stamp,
          id: newId(now.getTime()),
          name,
        })),
      });
  });
}

/**
 * What this listener reads from projects' `ProjectCreated`. Sales cannot
 * import the projects context, so `src/composition/project-created-listeners.ts`
 * checks at compile time that the real event still fits this copy.
 */
export type InboundProjectCreated = DomainEvent & {
  type: "ProjectCreated";
  projectId: string;
  createdBy: string;
};

function isProjectCreated(event: DomainEvent): event is InboundProjectCreated {
  return (
    event.type === "ProjectCreated" &&
    typeof (event as Partial<InboundProjectCreated>).projectId === "string"
  );
}

/**
 * On `ProjectCreated`, gives the new Project its own copy of the sales
 * lists. The Project is already committed, so a failure is logged rather
 * than failing the creation; the log names the Project so the seed, which
 * is idempotent, can be run again for it.
 */
export class SeedProjectSalesListener implements DomainEventListener {
  constructor(private readonly db: PrismaClient = prisma) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isProjectCreated(event)) return;
    try {
      await seedProjectSales(this.db, {
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        by: event.createdBy,
        now: event.occurredAt,
      });
    } catch (error) {
      console.error(
        `Seeding sales lists for a new Project failed (workspaceId ${event.workspaceId}, projectId ${event.projectId})`,
        error,
      );
    }
  }
}
