import { fencesForMember, type Fence } from "../domain/branch";
import type { EmployeeDirectory } from "./ports";

/** Where `MemberFences` reads fences and member links (Prisma: `PrismaBranchStore`). */
export type MemberFenceSource = {
  /** Every live office branch and project-site fence of the Company. */
  fences(workspaceId: string): Promise<Fence[]>;
  /** Live office branches the member is linked to. */
  linkedBranchIds(workspaceId: string, memberId: string): Promise<string[]>;
};

/**
 * The geo-fences that apply to one member (CM-304, ADR CM-0012 §4), for
 * check-in (CM-308) and `GET …/hrms/branches/my-fences`.
 *
 * `fencesFor(workspaceId, memberId)` answers the office branches the
 * member is linked to (every office branch when linked to none) plus,
 * for a Normal Team Member, the site fences of the Projects they are
 * assigned to; an HRMS Team Member gets office branches only. Office
 * branches come first, then sites, each by name. An unknown or removed
 * member has no fences (`[]`). No access check: the caller has done it.
 *
 * Pair it with `matchFence` / `isInsideAnyFence` from `domain/branch.ts`:
 * an empty list is "Office location is not configured", no match is
 * "Outside Fence".
 */
export class MemberFences {
  constructor(
    private readonly source: MemberFenceSource,
    private readonly employees: EmployeeDirectory,
  ) {}

  async fencesFor(workspaceId: string, memberId: string): Promise<Fence[]> {
    const [employees, fences, linkedBranchIds] = await Promise.all([
      this.employees.find(workspaceId, [memberId]),
      this.source.fences(workspaceId),
      this.source.linkedBranchIds(workspaceId, memberId),
    ]);
    const member = employees.get(memberId);
    if (member == null) return [];
    return fencesForMember(
      {
        memberType: member.memberType,
        linkedBranchIds,
        projectIds: member.projectIds,
      },
      fences,
    );
  }
}
