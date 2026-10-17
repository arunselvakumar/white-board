import type { Prisma } from "@repo/construction-db";

/** A transaction or the client: sales reads and writes inside its commands' transactions. */
export type SalesTx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// SalesDirectory (CM-1001): what sales reads from projects and organization
// (ADR CM-0022). Implemented in `src/composition/sales-directory.ts`.
// ---------------------------------------------------------------------------

export type SalesProjectFacts = {
  id: string;
  name: string;
  /** Wings (a building) or Locations (ADR CM-0013 §1). Bookings need Wings. */
  structure: "wings" | "locations";
};

/**
 * A Team Member (`*_member_id` columns hold these ids, not User ids). The
 * Owner is on every Project.
 */
export type SalesMemberFacts = {
  id: string;
  /** Null until the member joins. */
  userId: string | null;
  name: string;
  mobile: string | null;
  isOwner: boolean;
  /** Active and not removed. */
  active: boolean;
  /** On the Project asked about (always true for the Owner). */
  onProject: boolean;
};

export type SalesUnitFacts = {
  id: string;
  name: string;
  position: number;
  wingId: string;
  floorId: string;
  floorName: string;
  /** Removed in the Wing editor (or its Floor or Wing was). */
  deleted: boolean;
};

export type SalesFloorFacts = {
  id: string;
  name: string;
  kind: string;
  level: number;
  units: { id: string; name: string; position: number }[];
};

export type SalesWingFacts = {
  id: string;
  name: string;
  /** `construction_projects.wing_type`. */
  type: string;
  phaseId: string;
  phaseName: string;
};

/** A live Wing with its live Floors (top first) and Units. */
export type SalesWingTree = SalesWingFacts & { floors: SalesFloorFacts[] };

export type SalesDirectory = {
  /** A live Project of the Company, or null (404 `PROJECT_NOT_FOUND`). */
  project(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
  ): Promise<SalesProjectFacts | null>;
  /** Team Members by id with `onProject` answered for `projectId`; removed ones included. */
  members(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    memberIds: readonly string[],
  ): Promise<ReadonlyMap<string, SalesMemberFacts>>;
  /** Active Team Members on the Project (the Owner first), for pickers and import. */
  membersOnProject(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
  ): Promise<SalesMemberFacts[]>;
  /** The caller's Team Member, with `onProject` for `projectId`. */
  memberOfUser(
    db: SalesTx,
    workspaceId: string,
    userId: string,
    projectId: string,
  ): Promise<SalesMemberFacts | null>;
  /** The Project's live Wings in phase and wing order, with Floors and Units. */
  wings(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
  ): Promise<SalesWingTree[]>;
  /** Wings by id on the Project; removed ones included (for names). */
  wingsById(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    wingIds: readonly string[],
  ): Promise<ReadonlyMap<string, SalesWingFacts & { deleted: boolean }>>;
  /** Units by id on the Project; removed ones included, marked `deleted`. */
  units(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitIds: readonly string[],
  ): Promise<ReadonlyMap<string, SalesUnitFacts>>;
  /** Names for "who did this" by User id ("Deleted user" included). */
  userNames(
    db: SalesTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
};
