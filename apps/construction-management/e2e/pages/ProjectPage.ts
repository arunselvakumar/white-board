import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/** A screen inside one Project: its header and the Project menu. */
export abstract class ProjectPage extends AppShellPage {
  constructor(
    page: Page,
    protected readonly projectId: string,
  ) {
    super(page);
  }

  protected get base() {
    return `/app/projects/${this.projectId}`;
  }

  public get projectNav() {
    return this.page.getByRole("navigation", { name: "Project" });
  }

  public projectNavLink(name: string) {
    return this.projectNav.getByRole("link", { name, exact: true });
  }

  public get projectHeading() {
    return this.heading(/.+/, { level: 1 });
  }

  public get projectOptionsButton() {
    return this.button("Project options");
  }

  /** A `term` / `definition` pair, e.g. figure("Units"). */
  public figure(term: string) {
    return this.page
      .getByRole("term")
      .filter({ hasText: new RegExp(`^${term}$`) })
      .locator("xpath=following-sibling::*[1]");
  }
}
