import { InProcessEventDispatcher } from "@/src/shared-kernel/events";

/**
 * The one dispatcher every procurement write hands its domain events to
 * after commit (`document.approved`, `procurement.goods_receipt_posted`,
 * `procurement.stock_below_minimum`, …). It has no listeners yet; M9
 * (notifications) and M7 (supplier payables) register theirs here, so no
 * document type can be missed.
 */
export const procurementEvents = new InProcessEventDispatcher();
