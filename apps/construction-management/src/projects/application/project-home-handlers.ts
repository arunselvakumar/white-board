import {
  cleanDashboardLayout,
  storedDashboardLayout,
  type DashboardSectionSetting,
} from "../domain/dashboard-sections";
import {
  cleanModuleKeys,
  homeModules,
  pinnedFirst,
  type HomeModule,
} from "../domain/project-home";
import type { ProjectModuleKey } from "../domain/project-modules";
import type {
  ProjectCounts,
  ProjectPreferenceStore,
  ProjectStructureCounts,
} from "../domain/project-preferences";
import type { ProjectRepository } from "../domain/project-repository";
import { loadVisibleProject, type ProjectViewer } from "./project-handlers";
import {
  toProjectReadModel,
  type ProjectReadModel,
} from "./project-read-model";

/** A member's view of a Project's home (CM-411). */
export type ProjectHomeReadModel = {
  modules: HomeModule[];
  pinned: boolean;
  /** May hide and show modules: the Project menu's Update flag. */
  canHideModules: boolean;
};

/** The dashboard's Project summary (CM-412). */
export type ProjectSummaryReadModel = {
  project: ProjectReadModel;
  counts: ProjectStructureCounts;
};

/**
 * The Project home and the member's preferences (ADR CM-0013 §11–12):
 * modules by permission, structure and hidden state, hidden modules per
 * Project, tile order and dashboard layout per member for every Project,
 * and pins per member per Project. Routes check the Permission Matrix
 * first; these apply project visibility (another Project is "not found").
 */
export class ProjectHomeHandlers {
  constructor(
    private readonly projects: Pick<ProjectRepository, "findById">,
    private readonly preferences: ProjectPreferenceStore,
    private readonly counts: ProjectCounts,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * The modules the member sees on the Project, in their order. `canRead`
   * answers the Permission Matrix for a module's menu on this Project;
   * `canUpdate` is the Project menu's Update flag, which also shows hidden
   * modules (marked) so they can be shown again.
   */
  async home(input: {
    viewer: ProjectViewer;
    projectId: string;
    canRead: (menu: string) => boolean;
    canUpdate: boolean;
  }): Promise<ProjectHomeReadModel> {
    const project = await loadVisibleProject(
      this.projects,
      input.viewer,
      input.projectId,
    );
    const { workspaceId, userId } = input.viewer;
    const [hidden, rows, member, pins] = await Promise.all([
      this.preferences.hiddenModules(workspaceId, project.id),
      this.preferences.structureRows(workspaceId, project.id),
      this.preferences.memberPreferences(workspaceId, userId),
      this.preferences.pinnedIds(workspaceId, userId),
    ]);
    return {
      modules: homeModules({
        structure: project.structure,
        rows,
        canRead: input.canRead,
        hidden: new Set(hidden),
        showHidden: input.canUpdate,
        tileOrder: member.tileOrder,
      }),
      pinned: pins.has(project.id),
      canHideModules: input.canUpdate,
    };
  }

  /**
   * Hides exactly `keys` on the Project for everyone on it (400
   * `PROJECT_MODULE_UNKNOWN`). Hiding never grants or removes access.
   */
  async setHiddenModules(input: {
    viewer: ProjectViewer;
    projectId: string;
    keys: readonly string[];
  }): Promise<ProjectModuleKey[]> {
    const keys = cleanModuleKeys(input.keys);
    const project = await loadVisibleProject(
      this.projects,
      input.viewer,
      input.projectId,
    );
    const before = await this.preferences.hiddenModules(
      project.workspaceId,
      project.id,
    );
    const same =
      before.length === keys.length &&
      keys.every((key) => before.includes(key));
    if (!same)
      await this.preferences.setHiddenModules({
        workspaceId: project.workspaceId,
        projectId: project.id,
        keys,
        before,
        change: { by: input.viewer.userId, now: this.clock() },
      });
    return keys;
  }

  /**
   * The member's tile order for every Project (400 `PROJECT_MODULE_UNKNOWN`);
   * an empty list goes back to the default order.
   */
  async setTileOrder(input: {
    viewer: ProjectViewer;
    keys: readonly string[];
  }): Promise<ProjectModuleKey[]> {
    const keys = cleanModuleKeys(input.keys);
    await this.preferences.setTileOrder({
      workspaceId: input.viewer.workspaceId,
      userId: input.viewer.userId,
      keys,
      change: { by: input.viewer.userId, now: this.clock() },
    });
    return keys;
  }

  /** Pins or unpins a Project the member may see, for them only. */
  async setPinned(input: {
    viewer: ProjectViewer;
    projectId: string;
    pinned: boolean;
  }): Promise<boolean> {
    const project = await loadVisibleProject(
      this.projects,
      input.viewer,
      input.projectId,
    );
    await this.preferences.setPinned({
      workspaceId: project.workspaceId,
      userId: input.viewer.userId,
      projectId: project.id,
      pinned: input.pinned,
      change: { by: input.viewer.userId, now: this.clock() },
    });
    return input.pinned;
  }

  /** The member's pinned Projects. */
  pinnedIds(viewer: ProjectViewer): Promise<Set<string>> {
    return this.preferences.pinnedIds(viewer.workspaceId, viewer.userId);
  }

  /** Projects in list order with the member's pinned ones first. */
  async pinnedFirst<T extends { id: string }>(
    viewer: ProjectViewer,
    items: readonly T[],
  ): Promise<{ items: T[]; pinned: Set<string> }> {
    const pinned = await this.pinnedIds(viewer);
    return { items: pinnedFirst(items, pinned), pinned };
  }

  /** The member's dashboard layout: every section, in their order. */
  async dashboardLayout(
    viewer: ProjectViewer,
  ): Promise<DashboardSectionSetting[]> {
    const member = await this.preferences.memberPreferences(
      viewer.workspaceId,
      viewer.userId,
    );
    return storedDashboardLayout(member.dashboardSections);
  }

  /**
   * Saves Manage Dashboard for the member on every Project (400
   * `DASHBOARD_SECTION_UNKNOWN`, `DASHBOARD_SECTION_DUPLICATE`).
   */
  async setDashboardLayout(input: {
    viewer: ProjectViewer;
    sections: readonly { key: string; visible: boolean }[];
  }): Promise<DashboardSectionSetting[]> {
    const sections = cleanDashboardLayout(input.sections);
    await this.preferences.setDashboardSections({
      workspaceId: input.viewer.workspaceId,
      userId: input.viewer.userId,
      sections,
      change: { by: input.viewer.userId, now: this.clock() },
    });
    return sections;
  }

  /** The Project and what it holds, for the dashboard's Project summary. */
  async summary(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<ProjectSummaryReadModel> {
    const project = await loadVisibleProject(this.projects, viewer, projectId);
    return {
      project: toProjectReadModel(project),
      counts: await this.counts.count(project.workspaceId, project.id),
    };
  }
}
