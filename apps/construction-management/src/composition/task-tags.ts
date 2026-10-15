import { trackingMasterUsage } from "@/src/composition/tracking-usage";
import { createTrackingMasterHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import type { TaskTags } from "@/src/tracking/application/ports";

/**
 * The task import's tag create (CM-802, ADR CM-0019 §13): the masters'
 * inline `ensure` for each unknown name, so names stay unique per
 * Company, case-insensitive, and every create is audited there.
 */
export function masterTaskTags(): TaskTags {
  const tags = createTrackingMasterHandlers("tag", {
    usage: trackingMasterUsage(),
  });
  return {
    async ensure(workspaceId, by, names) {
      const out = new Map<string, string>();
      for (const name of names) {
        const { item } = await tags.ensure({ workspaceId, name, by });
        out.set(name.trim().toLowerCase(), item.id);
      }
      return out;
    },
  };
}
