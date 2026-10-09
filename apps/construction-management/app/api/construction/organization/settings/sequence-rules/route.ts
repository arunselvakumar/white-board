import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { assertKnownProjects } from "@/src/organization/application/project-directory";
import { createSequenceRuleHandlers } from "@/src/organization/infrastructure/create-sequence-rule-handlers";
import { PrismaProjectDirectory } from "@/src/organization/infrastructure/prisma-project-directory";

import {
  CreateConstructionOrganizationSequenceRuleRequestModel,
  type CreateConstructionOrganizationSequenceRuleResponseModel,
} from "./create-sequence-rule-models";
import {
  ListConstructionOrganizationSequenceRulesQueryModel,
  type ListConstructionOrganizationSequenceRulesResponseModel,
} from "./list-sequence-rules-models";
import { mapSequenceRule } from "./sequence-rule-fields";

export const dynamic = "force-dynamic";

const handlers = createSequenceRuleHandlers();
const projectDirectory = new PrismaProjectDirectory(prisma);

/** The Company's Sequence ID rules (CM-114). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ListConstructionOrganizationSequenceRulesQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const rules = await handlers.list(
      session.workspaceId,
      query.module ?? null,
    );
    const body: ListConstructionOrganizationSequenceRulesResponseModel = {
      items: rules.map(mapSequenceRule),
      total: rules.length,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds a rule: the module's default, or one Project's (400
 * `PROJECT_NOT_FOUND` unless it is a live Project of the Company).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationSequenceRuleRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { module, projectId, ...settings } = model;
    if (projectId != null)
      await assertKnownProjects(projectDirectory, session.workspaceId, [
        projectId,
      ]);
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      module,
      projectId,
      settings,
      by: session.userId,
    });
    const body: CreateConstructionOrganizationSequenceRuleResponseModel =
      mapSequenceRule(created);
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
