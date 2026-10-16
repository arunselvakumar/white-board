import { z } from "zod";

/** What the daily cron did (ADR CM-0021 §1). */
export const RunConstructionQueueDailyResponseModel = z.object({
  enqueued: z.array(z.string()),
  ran: z.number().int(),
  failed: z.number().int(),
});

export type RunConstructionQueueDailyResponseModel = z.infer<
  typeof RunConstructionQueueDailyResponseModel
>;
