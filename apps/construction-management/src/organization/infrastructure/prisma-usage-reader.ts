import type { PlanGrant } from "@/src/shared-kernel/plan";

import type { UsageReader } from "../application/subscription-ports";
import { BYTES_PER_GB, type UsageSnapshot } from "../domain/usage";
import type { StorageMeter } from "./storage-meter";

/** Live Projects in a Company. Projects arrive in M2 (CM-204). */
export type ProjectCounter = {
  countLive(workspaceId: string): Promise<number>;
};

/** Until the projects context exists there are no Projects to count. */
export const NO_PROJECTS: ProjectCounter = {
  countLive: () => Promise.resolve(0),
};

type TeamMemberCounter = {
  countLive(
    workspaceId: string,
    memberType: "normal" | "hrms",
  ): Promise<number>;
};

/** The usage behind the bars and the plan limits (CM-116, CM-118). */
export class PrismaUsageReader implements UsageReader {
  constructor(
    private readonly members: TeamMemberCounter,
    private readonly projects: ProjectCounter,
    private readonly storage: StorageMeter,
  ) {}

  async count(workspaceId: string, grant: PlanGrant): Promise<number> {
    switch (grant) {
      case "project":
        return this.projects.countLive(workspaceId);
      case "team_member":
        return this.members.countLive(workspaceId, "normal");
      case "hrms_member":
        return this.members.countLive(workspaceId, "hrms");
      case "storage_gb":
        return (await this.storage.bytesUsed(workspaceId)) / BYTES_PER_GB;
    }
  }

  async snapshot(workspaceId: string): Promise<UsageSnapshot> {
    const [project, team_member, hrms_member, storage_gb] = await Promise.all([
      this.count(workspaceId, "project"),
      this.count(workspaceId, "team_member"),
      this.count(workspaceId, "hrms_member"),
      this.count(workspaceId, "storage_gb"),
    ]);
    return { project, team_member, hrms_member, storage_gb };
  }
}
