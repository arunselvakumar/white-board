import type { DashboardSectionSetting } from "./dashboard-sections";
import type { ProjectModuleKey } from "./project-modules";

/** Who changed a preference and when, for the audit row. */
export type PreferenceChange = { by: string; now: Date };

/**
 * A Project's hidden modules, and a member's pins, tile order and
 * dashboard layout (ADR CM-0013 §11–12). Every write is audited in its
 * transaction.
 */
export type ProjectPreferenceStore = {
  hiddenModules(workspaceId: string, projectId: string): Promise<string[]>;
  /** Replaces the Project's hidden modules. */
  setHiddenModules(input: {
    workspaceId: string;
    projectId: string;
    keys: readonly ProjectModuleKey[];
    before: readonly string[];
    change: PreferenceChange;
  }): Promise<void>;
  /** Whether the Project has live Wings and live Locations. */
  structureRows(
    workspaceId: string,
    projectId: string,
  ): Promise<{ wings: boolean; locations: boolean }>;
  /** The member's tile order and stored dashboard layout (null: default). */
  memberPreferences(
    workspaceId: string,
    userId: string,
  ): Promise<{ tileOrder: string[]; dashboardSections: unknown }>;
  setTileOrder(input: {
    workspaceId: string;
    userId: string;
    keys: readonly ProjectModuleKey[];
    change: PreferenceChange;
  }): Promise<void>;
  setDashboardSections(input: {
    workspaceId: string;
    userId: string;
    sections: readonly DashboardSectionSetting[];
    change: PreferenceChange;
  }): Promise<void>;
  /** The member's pinned Projects (live or not; callers filter). */
  pinnedIds(workspaceId: string, userId: string): Promise<Set<string>>;
  /** Pins or unpins; a no-op when already so. */
  setPinned(input: {
    workspaceId: string;
    userId: string;
    projectId: string;
    pinned: boolean;
    change: PreferenceChange;
  }): Promise<void>;
};

/** What a Project holds, for the dashboard's Project summary (CM-412). */
export type ProjectStructureCounts = {
  wings: number;
  floors: number;
  units: number;
  locations: number;
  drawings: number;
  testingReports: number;
  documents: number;
};

/** Live rows per kind on a Project, read from the projects context's tables. */
export type ProjectCounts = {
  count(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectStructureCounts>;
};
