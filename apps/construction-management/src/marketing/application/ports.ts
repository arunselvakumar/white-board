import type { Prisma } from "@repo/construction-db";

import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files/stored-files";
import type { ListCursor, NameCursor } from "@/src/shared-kernel/list-cursor";
import type { OwnScope } from "@/src/shared-kernel/access";

import type {
  ContactDetails,
  ProspectCompanyDetails,
  StageMove,
} from "../domain/prospect-company";
import type {
  Interest,
  LostReason,
  Stage,
  VisitPurpose,
  VisitShownStatus,
  VisitStatus,
} from "../domain/marketing-terms";
import type { VisitDetails } from "../domain/visit";

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
  /** Every live company the scope sees, A–Z, for the Visit form's picker. */
  pickable(
    db: MarketingTx,
    workspaceId: string,
    scope: OwnScope,
  ): Promise<
    { id: string; name: string; address: string | null; city: string | null }[]
  >;
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
  /** Contacts by id, removed ones included (a past Visit's points of contact). */
  contactsByIds(
    db: MarketingTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredContact[]>;
  removeContact(
    tx: MarketingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
};

// ---------------------------------------------------------------------------
// Visits (ADR CM-0040 §7)
// ---------------------------------------------------------------------------

export type VisitRow = VisitDetails & {
  prospectCompanyId: string;
  visitAt: Date;
  status: VisitStatus;
  completedAt: Date | null;
  completedBy: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
};

export type StoredVisit = VisitRow & {
  id: string;
  workspaceId: string;
  number: string;
  visitorIds: string[];
  contactIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export type StoredVisitNote = {
  id: string;
  visitId: string;
  text: string;
  createdAt: Date;
  createdBy: string;
};

export type VisitListParams = {
  workspaceId: string;
  scope: OwnScope;
  now: Date;
  /** `visit_at` on or after. */
  from?: Date;
  /** `visit_at` before. */
  to?: Date;
  /** A visitor on it. */
  memberId?: string;
  prospectCompanyId?: string;
  statuses?: readonly VisitShownStatus[];
  purposes?: readonly VisitPurpose[];
  interests?: readonly Interest[];
  limit: number;
  /** Newest first: `visitAt` then `id`, as a list cursor. */
  after?: ListCursor;
};

export type VisitListRow = {
  id: string;
  number: string;
  prospectCompany: {
    id: string;
    name: string;
    createdBy: string;
    assignedMemberId: string | null;
  };
  visitAt: Date;
  status: VisitStatus;
  purpose: VisitPurpose | null;
  interest: Interest | null;
  outcome: string | null;
  visitorIds: string[];
  contactNames: string[];
  createdBy: string;
};

export type VisitStore = {
  find(
    db: MarketingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredVisit | null>;
  lock(
    tx: MarketingTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredVisit | null>;
  insert(
    tx: MarketingTx,
    row: VisitRow & {
      id: string;
      workspaceId: string;
      number: string;
      sequence: number;
      visitorIds: readonly string[];
      contactIds: readonly string[];
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /** Changes the row; the visitors and contacts only when given. */
  update(
    tx: MarketingTx,
    id: string,
    patch: Partial<VisitRow>,
    links: { visitorIds?: readonly string[]; contactIds?: readonly string[] },
    by: string,
    at: Date,
  ): Promise<void>;
  remove(tx: MarketingTx, id: string, by: string, at: Date): Promise<void>;
  notes(
    db: MarketingTx,
    workspaceId: string,
    visitIds: readonly string[],
  ): Promise<StoredVisitNote[]>;
  addNote(
    tx: MarketingTx,
    row: StoredVisitNote & { workspaceId: string },
  ): Promise<void>;
  list(
    db: MarketingTx,
    params: VisitListParams,
  ): Promise<{ items: VisitListRow[]; hasMore: boolean; total: number }>;
};

/** A Visit on its company's timeline. */
export type CompanyVisit = {
  id: string;
  number: string;
  visitAt: Date;
  status: VisitStatus;
  purpose: VisitPurpose | null;
  outcome: string | null;
  visitorIds: string[];
};

/**
 * What the company page and list read about Visits (ADR CM-0040 §5): only
 * the Visits the viewer may see.
 */
export type CompanyVisitsReader = {
  timeline(
    db: MarketingTx,
    workspaceId: string,
    companyId: string,
    scope: OwnScope,
  ): Promise<{
    visits: CompanyVisit[];
    notes: StoredVisitNote[];
    files: {
      id: string;
      visitId: string;
      fileName: string;
      caption: string | null;
      createdAt: Date;
      createdBy: string;
    }[];
  }>;
  /** The latest completed Visit of each company. */
  lastVisits(
    db: MarketingTx,
    workspaceId: string,
    companyIds: readonly string[],
    scope: OwnScope,
  ): Promise<Map<string, Date>>;
  /** Live Visits of the company, whoever logged them. */
  liveCount(
    tx: MarketingTx,
    workspaceId: string,
    companyId: string,
  ): Promise<number>;
};

// ---------------------------------------------------------------------------
// Visit files (ADR CM-0040 §9)
// ---------------------------------------------------------------------------

export type StoredVisitFile = {
  id: string;
  workspaceId: string;
  visitId: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  caption: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
};

export type VisitFileStore = {
  /** Live files of these Visits, oldest first. */
  files(
    workspaceId: string,
    visitIds: readonly string[],
  ): Promise<StoredVisitFile[]>;
  file(
    workspaceId: string,
    visitId: string,
    fileId: string,
  ): Promise<StoredVisitFile | null>;
  /** The file recorded at `key`, removed or not. */
  fileByKey(
    workspaceId: string,
    visitId: string,
    key: string,
  ): Promise<(StoredVisitFile & { deletedAt: Date | null }) | null>;
  countFiles(workspaceId: string, visitId: string): Promise<number>;
  /**
   * The file, its `stored_files` rows and the audit event in one
   * transaction with the live Visit row locked: 404 `VISIT_NOT_FOUND` when
   * the Visit is gone, `"duplicate"` when the key was recorded meanwhile
   * (checked before the limit), 409 `VISIT_FILE_LIMIT` when 20 are live.
   */
  addFile(input: {
    file: StoredVisitFile;
    storedFiles: NewStoredFile[];
    audit: AuditEvent;
  }): Promise<"added" | "duplicate">;
  /** The caption and its audit event; false (nothing written) if the file is gone. */
  setCaption(input: {
    file: StoredVisitFile;
    caption: string | null;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
  /** A tombstone, its `stored_files` rows marked deleted; false if already gone. */
  removeFile(input: {
    file: StoredVisitFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
  /**
   * Inside the Visit's delete: tombstones its live files and marks their
   * `stored_files` rows (file and thumbnail) deleted; returns them.
   */
  removeFilesOfVisit(
    tx: MarketingTx,
    input: { workspaceId: string; visitId: string; by: string; now: Date },
  ): Promise<Pick<StoredVisitFile, "id" | "fileKey" | "thumbKey">[]>;
};
