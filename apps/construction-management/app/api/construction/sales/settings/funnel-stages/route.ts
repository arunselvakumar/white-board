import { funnelStageRoutes } from "../settings-routes";

export const dynamic = "force-dynamic";

/** Adds a Funnel Stage at the bottom of the funnel. Needs Inquiry update on the Project (CM-1002). */
export const POST = funnelStageRoutes.create;
