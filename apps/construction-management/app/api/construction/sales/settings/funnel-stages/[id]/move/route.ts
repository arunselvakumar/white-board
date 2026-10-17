import { moveFunnelStage } from "../../../settings-routes";

export const dynamic = "force-dynamic";

/**
 * Moves a Funnel Stage one place up or down the funnel; answers with the
 * stages in their new order. Needs Inquiry update (CM-1002).
 */
export const POST = moveFunnelStage;
