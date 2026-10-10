import type { WingFloor } from "../domain/wing";
import type { FloorKind, WingConfig, WingType } from "../domain/wing-generator";

/** A Phase on the Wings screen, with how many live Wings it holds. */
export type PhaseView = {
  id: string;
  name: string;
  position: number;
  wings: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A Wing on the Wings screen: what it is and its totals. */
export type WingSummary = {
  id: string;
  phaseId: string;
  type: WingType;
  name: string;
  position: number;
  floors: number;
  units: number;
  updatedAt: Date;
};

/** The Wings screen: Phases in order, each with its Wings, and the totals. */
export type WingsOverview = {
  phases: (PhaseView & {
    items: WingSummary[];
    floors: number;
    units: number;
  })[];
  totals: { wings: number; floors: number; units: number };
};

/** One Wing for Edit Wing and the chart: configuration, floors and units. */
export type WingDetail = {
  id: string;
  phaseId: string;
  type: WingType;
  name: string;
  config: WingConfig;
  position: number;
  floors: WingFloor[];
  totals: { floors: number; units: number };
  createdAt: Date;
  updatedAt: Date;
};

/** A live unit of a live floor, in its order on the floor. */
export type WingTreeUnit = { id: string; name: string; position: number };

/** A live floor, with `level` descending top to bottom. */
export type WingTreeFloor = {
  id: string;
  kind: FloorKind;
  name: string;
  level: number;
  units: WingTreeUnit[];
};

/** A live Wing with its live floors and units, for pickers and resolvers. */
export type WingTree = {
  id: string;
  phaseId: string;
  phaseName: string;
  type: WingType;
  name: string;
  floors: WingTreeFloor[];
};

/** A live Location in the Team Member's order. */
export type LocationView = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Reads of a Project's structure by Company and Project id, with no
 * visibility check: the projects handlers check visibility first, and the
 * composition root's `LocationResolver` (CM-403) uses `wings` and
 * `locations` to check a site entry's LocationRef against its Project.
 * Everything here is live (tombstones left out).
 */
export type ProjectStructureReader = {
  /** Phases in order, with their live Wing counts. */
  phases(workspaceId: string, projectId: string): Promise<PhaseView[]>;
  /** Wings with floor and unit totals, in Phase order then Wing order. */
  wingSummaries(workspaceId: string, projectId: string): Promise<WingSummary[]>;
  /**
   * The Project's live Wings, in Phase order then Wing order, each with its
   * live floors top to bottom and their live units in order.
   */
  wings(workspaceId: string, projectId: string): Promise<WingTree[]>;
  /** One live Wing of the Project as in `wings`, or null. */
  wing(
    workspaceId: string,
    projectId: string,
    wingId: string,
  ): Promise<WingTree | null>;
  /** The Project's live Locations in their order. */
  locations(workspaceId: string, projectId: string): Promise<LocationView[]>;
};
