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

/**
 * A Client (CM-1107, ADR CM-0023 §2): a receivable party. Its Projects are
 * the live Projects that link it.
 */
export type ClientFacts = {
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

/** A live Goods Receipt as a supplier invoice reads it (CM-0017 §13). */
export type GoodsReceiptFacts = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  location: { kind: "project" | "store"; id: string };
  receiptDate: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  /** Paise. */
  invoiceAmount: bigint | null;
  /** Paise, GST included. */
  totalValue: bigint;
  /** The linked PO's payment terms; null without a PO. */
  paymentTermsDays: number | null;
  updatedBy: string;
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
  /** Clients by id (live ones), from `construction_masters.clients` (CM-1107). */
  clients(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ClientFacts>>;
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
   * current Project it is, Vendors assigned to it, Clients the Project
   * links; Team Members are Company-wide). Other Parties live in finance
   * and are not read here.
   */
  listParties(
    db: Db,
    workspaceId: string,
    kind:
      | "contractor"
      | "supplier"
      | "labour"
      | "vendor"
      | "team_member"
      | "client",
    projectId: string | null,
  ): Promise<NamedFacts[]>;
  /** Live GRNs by id (CM-705). */
  goodsReceipts(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, GoodsReceiptFacts>>;
  /**
   * Live GRNs at a Project or Store that no live supplier invoice links
   * ("awaiting invoice", CM-0017 §13), oldest first; one Supplier's when
   * given.
   */
  awaitingInvoiceGoodsReceipts(
    db: Db,
    workspaceId: string,
    location: { kind: "project" | "store"; id: string },
    supplierId: string | null,
  ): Promise<GoodsReceiptFacts[]>;
  /**
   * Payments that moved a Contracts advance (CM-1108), by payment id, with
   * a label ("mobilisation advance on WO/26-27/00001"). Finance shows them
   * and refuses to cancel or apply them: Contracts does.
   */
  contractAdvances(
    db: Db,
    workspaceId: string,
    paymentIds: readonly string[],
  ): Promise<Map<string, { label: string }>>;
  /**
   * Retention releases by id (CM-1108): the Work Order a contractor-side
   * release is on (its number), none for the client contract.
   */
  retentionReleases(
    db: Db,
    workspaceId: string,
    releaseIds: readonly string[],
  ): Promise<
    Map<
      string,
      {
        side: "contractor" | "client";
        workOrderId: string | null;
        workOrderNumber: string | null;
      }
    >
  >;
  /** Names of Users by user id, from their Team Members (CM-705). */
  userNames(
    db: Db,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
  /**
   * Money paid to Labours and to Vendors on a Project between two dates
   * (live wage payments and advances, M2; CM-709 Module Wise Payment), in
   * paise.
   */
  wagesPaid(
    db: Db,
    workspaceId: string,
    projectId: string,
    range: { from: string; to: string },
  ): Promise<{ labour: bigint; vendor: bigint }>;
};
