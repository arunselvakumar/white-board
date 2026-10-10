import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  createProjectResources,
  type ResourceKind,
} from "@/src/composition/project-resources";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  SetConstructionProjectsProjectResourcesRequestModel,
  toResourceOptionsResponse,
  toResourcesResponse,
} from "./resources-models";

/** One composition for every Resources route (CM-406). */
export const projectResources = createProjectResources();

type IdContext = { params: Promise<{ id: string }> };

/**
 * The two routes of one party kind: `GET …/{kind}/options` (the Company's
 * active parties, for the Edit dialog) and `POST …/{kind}` (replace the
 * set). Both need the Project menu's Update flag and the Project visible
 * to the caller (404 otherwise).
 */
export function resourceKindRoutes(kind: ResourceKind) {
  return {
    options: async (request: Request, context: IdContext) => {
      try {
        const session = await requireAccess(
          request,
          "projects.project",
          "update",
        );
        if (isResponse(session)) return session;
        const { id } = parseOrThrow(
          ConstructionProjectsProjectParamsModel.safeParse(
            await context.params,
          ),
        );
        return Response.json(
          toResourceOptionsResponse(
            await projectResources.assignable(session.access, id, kind),
          ),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    set: async (request: Request, context: IdContext) => {
      try {
        const session = await requireAccess(
          request,
          "projects.project",
          "update",
        );
        if (isResponse(session)) return session;
        const { id } = parseOrThrow(
          ConstructionProjectsProjectParamsModel.safeParse(
            await context.params,
          ),
        );
        const body = parseOrThrow(
          SetConstructionProjectsProjectResourcesRequestModel.safeParse(
            await request.json(),
          ),
        );
        return Response.json(
          toResourcesResponse(
            await projectResources.set(session.access, id, kind, body),
          ),
        );
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
