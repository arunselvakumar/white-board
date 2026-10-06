import { z } from "zod";

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Reason = z.string().max(200).nullish();

export const TrainingInstituteClassSlotModel = z.object({
  date: z.iso.date(),
  startTime: Clock,
  endTime: Clock,
});

export const CancelTrainingInstituteClassRequestModel = z.object({
  reason: Reason,
});

export const MoveTrainingInstituteClassRequestModel =
  TrainingInstituteClassSlotModel.extend({ reason: Reason });

export const TrainingInstituteClassChangeModel = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  date: z.iso.date(),
  startTime: Clock,
  endTime: Clock,
  kind: z.enum(["cancelled", "moved"]),
  reason: z.string().nullable(),
  movedTo: TrainingInstituteClassSlotModel.nullable(),
});
