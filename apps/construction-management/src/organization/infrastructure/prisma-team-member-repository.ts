import { Prisma, type PrismaClient } from "@repo/construction-db";

import { PermissionSet } from "@/src/shared-kernel/access";
import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import type { PrivateDataCipher } from "@/src/shared-kernel/private-data";

import { TeamMember } from "../domain/team-member";
import type {
  TeamMemberListPage,
  TeamMemberListParams,
  TeamMemberRepository,
} from "../domain/team-member-repository";

const INCLUDE = {
  permissions: true,
  projects: true,
} satisfies Prisma.ConstructionOrganizationTeamMemberInclude;

type Row = Prisma.ConstructionOrganizationTeamMemberGetPayload<{
  include: typeof INCLUDE;
}>;

type Db = Pick<PrismaClient, "constructionOrganizationTeamMember">;

function mapWriteError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = JSON.stringify(error.meta ?? {});
    if (target.includes("email"))
      return conflict(
        "MEMBER_EMAIL_IN_USE",
        "Another Team Member in this Company has this email.",
      );
    if (target.includes("user"))
      return conflict(
        "MEMBER_ALREADY_IN_COMPANY",
        "This User is already a Team Member.",
      );
    return conflict(
      "MEMBER_MOBILE_IN_USE",
      "Another Team Member in this Company has this mobile number.",
    );
  }
  return error;
}

export class PrismaTeamMemberRepository implements TeamMemberRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly cipher: () => PrivateDataCipher,
  ) {}

  private toDomain(row: Row): TeamMember {
    const masks: Record<string, number> = {};
    for (const grant of row.permissions) masks[grant.menu] = grant.flags;
    return TeamMember.reconstitute({
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      details: {
        name: row.name,
        designationId: row.designationId,
        mobile: row.mobile,
        email: row.email,
        address: row.address,
        aadhaar:
          row.aadhaarEncrypted == null
            ? null
            : this.cipher().decrypt(row.aadhaarEncrypted),
        pan:
          row.panEncrypted == null
            ? null
            : this.cipher().decrypt(row.panEncrypted),
        emergencyContact: row.emergencyContact,
      },
      memberType: row.memberType,
      isOwner: row.isOwner,
      status: row.status,
      projectIds: row.projects.map((project) => project.projectId).sort(),
      permissions: row.isOwner
        ? PermissionSet.everything()
        : PermissionSet.fromMasks(masks),
      inviteToken: row.inviteToken,
      invitedAt: row.invitedAt,
      joinedAt: row.joinedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt,
    });
  }

  /** The columns of a Team Member, Aadhaar and PAN sealed. */
  columns(member: TeamMember) {
    const { details } = member;
    return {
      workspaceId: member.workspaceId,
      userId: member.userId,
      name: details.name,
      designationId: details.designationId,
      mobile: details.mobile,
      email: details.email,
      address: details.address,
      aadhaarEncrypted:
        details.aadhaar == null ? null : this.cipher().encrypt(details.aadhaar),
      aadhaarLast4: details.aadhaar?.slice(-4) ?? null,
      panEncrypted:
        details.pan == null ? null : this.cipher().encrypt(details.pan),
      panLast4: details.pan?.slice(-4) ?? null,
      emergencyContact: details.emergencyContact,
      memberType: member.memberType,
      isOwner: member.isOwner,
      status: member.status,
      inviteToken: member.inviteToken,
      invitedAt: member.invitedAt,
      joinedAt: member.joinedAt,
      updatedAt: member.updatedAt,
      updatedBy: member.updatedBy,
      deletedAt: member.deletedAt,
    };
  }

  /** Writes the member, its projects and its matrix inside `tx`. */
  async write(tx: Prisma.TransactionClient, member: TeamMember): Promise<void> {
    const data = this.columns(member);
    try {
      await tx.constructionOrganizationTeamMember.upsert({
        where: { id: member.id },
        create: {
          id: member.id,
          createdAt: member.createdAt,
          createdBy: member.createdBy,
          ...data,
        },
        update: data,
      });
    } catch (error) {
      throw mapWriteError(error);
    }
    await tx.constructionOrganizationTeamMemberProject.deleteMany({
      where: { memberId: member.id },
    });
    if (member.projectIds.length > 0)
      await tx.constructionOrganizationTeamMemberProject.createMany({
        data: member.projectIds.map((projectId) => ({
          memberId: member.id,
          projectId,
        })),
      });
    await tx.constructionOrganizationMemberMenuPermission.deleteMany({
      where: { memberId: member.id },
    });
    // The Owner's rights are implied, never stored (ADR CM-0003).
    if (!member.isOwner) {
      const masks = member.permissions.toMasks();
      const rows = Object.entries(masks).map(([menu, flags]) => ({
        workspaceId: member.workspaceId,
        memberId: member.id,
        menu,
        flags,
        updatedAt: member.updatedAt,
        updatedBy: member.updatedBy,
      }));
      if (rows.length > 0)
        await tx.constructionOrganizationMemberMenuPermission.createMany({
          data: rows,
        });
    }
  }

  async save(member: TeamMember, audit?: AuditEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.write(tx, member);
      if (audit != null) await recordAudit(tx, audit);
    });
  }

  async saveMany(
    entries: readonly { member: TeamMember; audit: AuditEvent }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.db.$transaction(async (tx) => {
      for (const { member, audit } of entries) {
        await this.write(tx, member);
        await recordAudit(tx, audit);
      }
    });
  }

  async findByIds(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<TeamMember[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      include: INCLUDE,
    });
    return rows.map((row) => this.toDomain(row));
  }

  async listForProject(
    workspaceId: string,
    projectId: string,
  ): Promise<TeamMember[]> {
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [{ isOwner: true }, { projects: { some: { projectId } } }],
      },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.toDomain(row));
  }

  async listAssignable(workspaceId: string): Promise<TeamMember[]> {
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isOwner: false,
        memberType: "normal",
        status: { in: ["joining_pending", "active"] },
      },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.toDomain(row));
  }

  private async findOne(
    db: Db,
    where: Prisma.ConstructionOrganizationTeamMemberWhereInput,
  ): Promise<TeamMember | null> {
    const row = await db.constructionOrganizationTeamMember.findFirst({
      where: { ...where, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : this.toDomain(row);
  }

  findById(workspaceId: string, id: string): Promise<TeamMember | null> {
    return this.findOne(this.db, { workspaceId, id });
  }

  findByUser(workspaceId: string, userId: string): Promise<TeamMember | null> {
    return this.findOne(this.db, { workspaceId, userId });
  }

  findByInviteToken(token: string): Promise<TeamMember | null> {
    return this.findOne(this.db, { inviteToken: token });
  }

  async findPendingFor(contact: {
    mobile: string | null;
    email: string | null;
  }): Promise<TeamMember[]> {
    const or: Prisma.ConstructionOrganizationTeamMemberWhereInput[] = [];
    if (contact.mobile != null) or.push({ mobile: contact.mobile });
    if (contact.email != null)
      or.push({ email: { equals: contact.email, mode: "insensitive" } });
    if (or.length === 0) return [];
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: { status: "joining_pending", deletedAt: null, OR: or },
      include: INCLUDE,
      orderBy: { invitedAt: "desc" },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async list(params: TeamMemberListParams): Promise<TeamMemberListPage> {
    const search = params.search?.trim() ?? "";
    const filters: Prisma.ConstructionOrganizationTeamMemberWhereInput[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
    ];
    if (params.status != null) filters.push({ status: params.status });
    if (params.memberType != null)
      filters.push({ memberType: params.memberType });
    if (search.length > 0)
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { mobile: { contains: search.replace(/\s/g, "") } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      });
    const where = { AND: filters };

    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await this.db.constructionOrganizationTeamMember.findMany({
      where:
        cursor == null
          ? where
          : {
              AND: [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { createdAt: { gt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { createdAt: { lt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
            },
      include: INCLUDE,
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionOrganizationTeamMember.count({
      where,
    });
    return { items: rows.map((row) => this.toDomain(row)), total, hasMore };
  }

  countLive(
    workspaceId: string,
    memberType: "normal" | "hrms",
  ): Promise<number> {
    return this.db.constructionOrganizationTeamMember.count({
      where: {
        workspaceId,
        memberType,
        deletedAt: null,
        status: { in: ["joining_pending", "active"] },
      },
    });
  }

  async usesDesignation(
    workspaceId: string,
    designationId: string,
  ): Promise<boolean> {
    const count = await this.db.constructionOrganizationTeamMember.count({
      where: { workspaceId, designationId, deletedAt: null },
    });
    return count > 0;
  }
}
