import { workOrderRoute } from "../work-order-route";

export const dynamic = "force-dynamic";

/**
 * One Work Order with its lines, materials, earlier revisions and BOQ
 * warnings (CM-1104). Money is null without Financial. Needs Work Order
 * read.
 */
export const GET = workOrderRoute("read", () => Promise.resolve());
