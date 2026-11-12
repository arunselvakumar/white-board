import type { Prisma } from "@repo/construction-db";

import type { NameCursor } from "@/src/shared-kernel/list-cursor";
import type { OwnScope } from "@/src/shared-kernel/access";

import type {
  ContactDetails,
  ProspectCompanyDetails,
  StageMove,
} from "../domain/prospect-company";
import type { LostReason, Stage } from "../domain/marketing-terms";

export type MarketingTx = Prisma.TransactionClient;

export type MarketingDb = MarketingTx & {
  $transaction<T>(fn: (tx: MarketingTx) => Promise<T>): Promise<T>;
};

// ---------------------------------------------------------------------------
// MarketingTeam: what marketing reads from organization (ADR CM-0040 §4).
// Implemented in `src/composition/marketing-team.ts`.
// ---------------------------------------------------------------------------

/** A Team Member whose Role holds Visits create, or the Owner. */
export type MarketingPerson = {
  id: string;
  name: string;
  mobile: string | null;
  isOwner: boolean;
  active: boolean;
};

export type MarketingTeam = {
  /** Marketing People, active or not; removed members are left out. */
  people(workspaceId: string): Promise<MarketingPerson[]>;
  /**
   * Names of Team Members by id, whatever their Role or status, so a past
   * record keeps the name of someone who left (ADR CM-0040 §4).
   */
  memberNames(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<Map<string, string>>;
  /** Names for "who did this" by User id (`userNamesInCompany`). */
  userNames(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
  /** The caller's own live Team Member id; the Owner's included. */
  memberOfUser(workspaceId: string, userId: string): Promise<string | null>;
};

// ---------------------------------------------------------------------------
// ProspectCompanyStore
// ---------------------------------------------------------------------------

export type StoredProspectCompany = ProspectCompanyDetails & {
  id: string;
  workspaceId: string;
  assignedMemberId: string | null;
  stage: Stage;
  lostReason: LostReason | null;
  lostReasonText: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredContact = ContactDetails & {
  id: string;
  prospectCompanyId: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredStageChange = {
  id: string;
  fromStage: Stage | null;
  toStage: Stage;
  lostReason: LostReason | null;
  lostReasonText: string | null;
  changedAt: Date;
  changedBy: string;
};

/** A row of the Companies list. */
export type ProspectCompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  stateCode: string | null;
  stage: Stage;
  assignedMemberId: string | null;
  primaryContact: { name: string; mobile: string | null } | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProspectCompanyListParams = {
  workspaceId: string;
  scope: OwnScope;
  /** Part of the name, city, a Contact's name, or a Contact's mobile. */
  search?: string;
  stages?: readonly Stage[];
  assignedMemberId?: string;
  /** Exactly this industry, ignoring case. */
  industry?: string;
  limit: number;
  after?: NameCursor;
};

export type ProspectCompanyPage = {
  items: ProspectCompanyRow[];
  hasMore: boolean;
  total: number;
};

export type ProspectCompanyStore = {
  find(
    db: MarketingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredProspectCompany | null>;
  /** The live company's row, locked for the rest of the transaction. */
  lock(
    tx: MarketingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredProspectCompany | null>;
  nameTaken(
    db: MarketingTx,
    workspaceId: string,
    nameKey: string,
    exceptId: string | null,
  ): Promise<boolean>;
  insert(
    tx: MarketingTx,
    row: ProspectCompanyDetails & {
      id: string;
      workspaceId: string;
      assignedMemberId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  update(
    tx: MarketingTx,
    id: string,
    details: ProspectCompanyDetails,
    by: string,
    at: Date,
  ): Promise<void>;
  setStage(
    tx: MarketingTx,
    id: string,
    move: StageMove,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Tombstones the company and its Contacts. */
  remove(tx: MarketingTx, id: string, by: string, at: Date): Promise<void>;
  appendStageChange(
    tx: MarketingTx,
    row: {
      workspaceId: string;
      prospectCompanyId: string;
      fromStage: Stage | null;
      move: StageMove;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  stageChanges(
    db: MarketingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredStageChange[]>;
  list(
    db: MarketingTx,
    params: ProspectCompanyListParams,
  ): Promise<ProspectCompanyPage>;
  /** Industries typed on the Company's live companies the scope sees, A–Z. */
  industries(
    db: MarketingTx,
    workspaceId: string,
    scope: OwnScope,
  ): Promise<string[]>;

  contacts(
    db: MarketingTx,
    workspaceId: string,
    prospectCompanyId: string,
  ): Promise<StoredContact[]>;
  insertContact(
    tx: MarketingTx,
    row: ContactDetails & {
      id: string;
      workspaceId: string;
      prospectCompanyId: string;
      isPrimary: boolean;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  updateContact(
    tx: MarketingTx,
    id: string,
    details: ContactDetails,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Makes this Contact the company's only primary one. */
  makePrimary(
    tx: MarketingTx,
    prospectCompanyId: string,
    contactId: string,
    by: string,
    at: Date,
  ): Promise<void>;
  removeContact(
    tx: MarketingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
};
