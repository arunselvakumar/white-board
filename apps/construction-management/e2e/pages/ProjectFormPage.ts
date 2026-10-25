import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/** New Project and Edit Project. */
export class ProjectFormPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly projectId: string | null = null,
  ) {
    super(page);
  }

  public get url() {
    return this.projectId == null
      ? "/app/projects/new"
      : `/app/projects/${this.projectId}/edit`;
  }

  public get nameField() {
    return this.field("Project name");
  }

  public colour(name: string) {
    return this.page.getByRole("radio", { name });
  }

  public get addressField() {
    return this.field("Project address");
  }

  public section(name: "Client" | "Contract" | "Additional details") {
    return this.page.getByRole("button", {
      name: new RegExp(`^${name}( Optional)?$`),
    });
  }

  /** Expands an optional section unless it is open already. */
  public async openSection(name: "Client" | "Contract" | "Additional details") {
    const toggle = this.section(name);
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
  }

  public get addProjectButton() {
    return this.button("Add Project");
  }

  public get saveButton() {
    return this.button(/^Save/);
  }

  public async fill(input: { name: string; type?: string; colour?: string }) {
    await this.nameField.fill(input.name);
    if (input.colour != null) await this.colour(input.colour).check();
    await this.choose("Project Type", input.type ?? "Residential");
  }
}
