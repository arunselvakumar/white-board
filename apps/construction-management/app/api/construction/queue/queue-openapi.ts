import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { RunConstructionQueueDailyResponseModel } from "./queue-models";

const QUEUE = ["Construction · Queue"];

export const queueOpenApiComponents: OpenApiComponents = {
  RunConstructionQueueDailyResponseModel,
};

/** The kernel's job queue (ADR CM-0021 §1). */
export const queueOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/queue/drain/scheduled",
    summary:
      "Daily cron: enqueue the day's jobs and drain the queue; `Authorization: Bearer <CRON_SECRET>` (Vercel Cron), no Session",
    tags: QUEUE,
    security: false,
    successStatus: StatusCodes.OK,
    successDescription: "Daily jobs enqueued and how many jobs ran",
    successSchema: RunConstructionQueueDailyResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.SERVICE_UNAVAILABLE],
  },
];
