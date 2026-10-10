import { PROJECT_DOCUMENT_MAX_BYTES } from "@/src/projects/domain/project-document-rules";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createProjectDocuments } from "@/src/projects/infrastructure/create-project-documents";

import { projectUploadRoutes } from "../../../project-upload-routes";
import { StartConstructionProjectsDocumentUploadRequestModel } from "./project-document-models";
import { documentsPath } from "./project-document-responses";

/**
 * One composition for the Project document routes (CM-414). Storage limits
 * are the organization context's plan; the routes are where contexts meet.
 */
export const projectDocuments = createProjectDocuments({
  plan: createPlanGate(),
});

/** Documents' upload routes on the attachments service (CM-407). */
export const documentUploadRoutes = projectUploadRoutes({
  menu: "projects.project",
  flags: ["update"],
  owner: projectDocuments,
  basePath: documentsPath,
  startModel: StartConstructionProjectsDocumentUploadRequestModel,
  maxBytes: PROJECT_DOCUMENT_MAX_BYTES,
});
