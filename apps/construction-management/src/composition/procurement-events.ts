import type { EventDispatcher } from "@/src/shared-kernel/events";

import { messagingEvents } from "./messaging";

/**
 * The one dispatcher every procurement write hands its domain events to
 * after commit (`document.approved`, `procurement.goods_receipt_posted`,
 * `procurement.stock_below_minimum`, …). Messaging's listeners turn them
 * into notifications (CM-904); finance's supplier payables listen through
 * `party-finance.ts` (CM-705). It lives in the composition root so no
 * document type can be missed.
 */
export const procurementEvents: EventDispatcher = messagingEvents();
