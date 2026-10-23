import { escalationBillRoute } from "../escalation-bill-access";

export const dynamic = "force-dynamic";

/**
 * One escalation bill (CM-1109): the working (R, its bills, each
 * component's weight, series, I₀, months, Ī, factor and amount), GST,
 * deductions and net, and what is left to recover on a negative one.
 * Money is null without Financial. Needs the side's bill read.
 */
export const GET = escalationBillRoute("read", () => Promise.resolve());
