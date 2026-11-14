import type { PrismaClient } from "@repo/construction-db";

type Ref = { id: string; name: string };

type Db = Pick<
  PrismaClient,
  "constructionOrganizationTeamMemberProject" | "constructionMastersSupervisor"
>;

const byName = (a: Ref, b: Ref) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * The Site Engineers on each Project (ADR CM-0041): live, enabled Site
 * Engineer rows whose sign-in is assigned to the Project (CM-0038 §3), by
 * name. The Owner is on every Project without being assigned, so never
 * counts. Projects with none are left out of the map. Plain reads of the
 * masters and organization tables, like the other directories.
 */
export async function siteEngineersOnProjects(
  db: Db,
  workspaceId: string,
  projectIds: readonly string[],
): Promise<Map<string, Ref[]>> {
  const wanted = [...new Set(projectIds)];
  if (wanted.length === 0) return new Map();
  const assignments =
    await db.constructionOrganizationTeamMemberProject.findMany({
      where: {
        projectId: { in: wanted },
        member: { workspaceId, deletedAt: null, isOwner: false },
      },
      select: { memberId: true, projectId: true },
    });
  if (assignments.length === 0) return new Map();
  const engineers = await db.constructionMastersSupervisor.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      disabledAt: null,
      teamMemberId: {
        in: [...new Set(assignments.map((row) => row.memberId))],
      },
    },
    select: { id: true, name: true, teamMemberId: true },
  });
  const byMember = new Map<string, Ref[]>();
  for (const engineer of engineers) {
    if (engineer.teamMemberId == null) continue;
    const list = byMember.get(engineer.teamMemberId) ?? [];
    list.push({ id: engineer.id, name: engineer.name });
    byMember.set(engineer.teamMemberId, list);
  }
  const result = new Map<string, Ref[]>();
  for (const { memberId, projectId } of assignments) {
    const found = byMember.get(memberId);
    if (found == null) continue;
    result.set(projectId, [...(result.get(projectId) ?? []), ...found]);
  }
  for (const [projectId, list] of result)
    result.set(projectId, list.sort(byName));
  return result;
}

/** Everyone on any of `projectIds`, once each, by name. */
export function siteEngineersOf(
  projectIds: readonly string[],
  byProject: ReadonlyMap<string, readonly Ref[]>,
): Ref[] {
  const found = new Map<string, Ref>();
  for (const projectId of projectIds)
    for (const engineer of byProject.get(projectId) ?? [])
      found.set(engineer.id, engineer);
  return [...found.values()].sort(byName);
}
