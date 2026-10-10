import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { DRAWING_MAX_BYTES } from "@/src/projects/domain/project-upload-policies";
import { createProjectDrawings } from "@/src/projects/infrastructure/create-project-drawings";

import { projectUploadRoutes } from "../../../project-upload-routes";
import { StartConstructionProjectsDrawingUploadRequestModel } from "./drawing-models";
import { drawingsPath } from "./drawing-responses";

/** One composition for the Project Drawings routes (CM-408). */
export const projectDrawings = createProjectDrawings({
  plan: createPlanGate(),
});

/**
 * Drawings' upload routes on the attachments service (CM-407): a new
 * drawing needs Create, a new revision Update, so either flag may upload.
 */
export const drawingUploadRoutes = projectUploadRoutes({
  menu: "projects.drawings",
  flags: ["create", "update"],
  owner: projectDrawings,
  basePath: drawingsPath,
  startModel: StartConstructionProjectsDrawingUploadRequestModel,
  maxBytes: DRAWING_MAX_BYTES,
});
