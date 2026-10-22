import { measurementRoute } from "../measurement-route";

export const dynamic = "force-dynamic";

/**
 * One sheet with its rows, the cumulative quantity per item (deviation and
 * over-quantity marks) and what the caller may do (CM-1105). Needs
 * Measurement Book read.
 */
export const GET = measurementRoute("read", () => Promise.resolve());
