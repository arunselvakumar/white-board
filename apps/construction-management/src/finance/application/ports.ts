import type { Prisma } from "@repo/construction-db";

/**
 * Ports of the finance context (ADR CM-0017 §1). Finance never imports
 * another context: what it reads from masters, organization, projects,
 * procurement and labour comes through these, implemented in
 * `src/composition`. Each ticket adds the methods it needs (append-only).
 */

type Db = Prisma.TransactionClient;

export type ContractorFacts = {
  id: string;
  name: string;
  pan: string | null;
  gstin: string | null;
  stateCode: string | null;
  isActive: boolean;
  /** TDS settings (ADR CM-0017 §8). */
  tdsApplicable: boolean;
  /** Percent, two places; null without a certificate. */
  tdsLowerRate: string | null;
  tdsNote: string | null;
  projectIds: string[];
  departmentIds: string[];
};

export type SupplierFacts = {
  id: string;
  name: string;
  pan: string | null;
  gstin: string | null;
  stateCode: string | null;
  isActive: boolean;
  projectIds: string[];
};

export type NamedFacts = { id: string; name: string };

export type TeamMemberFacts = {
  id: string;
  name: string;
  /** Null until the invitation is accepted. */
  userId: string | null;
  active: boolean;
};

export type FinanceDirectory = {
  contractors(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ContractorFacts>>;
  suppliers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, SupplierFacts>>;
  /** Live Projects by id. */
  projects(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  /** Live Central Stores by id. */
  stores(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  /** Team Members by id (any status, for names on old entries). */
  teamMembers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, TeamMemberFacts>>;
  /** The Team Member of a user in the Company, if any. */
  memberOfUser(
    db: Db,
    workspaceId: string,
    userId: string,
  ): Promise<TeamMemberFacts | null>;
  /** Live Labours and Vendors by id (for Paid To labels). */
  labours(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  vendors(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  /** Live Departments by id. */
  departments(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  /**
   * Live, active parties of a kind for a picker, by name: on the Project
   * when given (Contractors and Suppliers assigned to it, Labours whose
   * current Project it is, Vendors assigned to it; Team Members are
   * Company-wide). Other Parties live in finance and are not read here.
   */
  listParties(
    db: Db,
    workspaceId: string,
    kind: "contractor" | "supplier" | "labour" | "vendor" | "team_member",
    projectId: string | null,
  ): Promise<NamedFacts[]>;
};
