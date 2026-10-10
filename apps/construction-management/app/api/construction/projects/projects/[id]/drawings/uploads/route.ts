import { drawingUploadRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts uploading a drawing or a revision (CM-408): checks the name
 * (PDF, image, DWG, DXF), size (≤ 100 MB) and plan, and says where the
 * bytes go.
 */
export const POST = drawingUploadRoutes.start;
